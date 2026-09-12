import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * A server component may RENDER a client component, but it may not CALL a
 * plain function exported from a 'use client' module — on the server that
 * export is a client reference, and calling it throws. That shipped once:
 * the dashboard called colourOf() from AvatarToggle and crashed after Done.
 */
const ROOT = process.cwd()

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

const isClient = (file: string) => /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8'))
const stripExt = (file: string) => file.replace(/\.tsx?$/, '')

describe('server / client boundary', () => {
  it('no server file calls a function exported from a use-client module', () => {
    const files = ['app', 'components', 'lib'].flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
    const clientModules = new Set(files.filter(isClient).map(stripExt))
    const offenders: string[] = []

    for (const file of files.filter((f) => !isClient(f))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s+from\s+'([^']+)'/g)) {
        const [, names = '', spec = ''] = match
        if (!spec.startsWith('@/') && !spec.startsWith('.')) continue
        const target = spec.startsWith('@/')
          ? path.join(ROOT, spec.slice(2))
          : path.resolve(path.dirname(file), spec)
        if (!clientModules.has(target)) continue
        // Components are PascalCase and fine to render; lowercase values are functions.
        const called = names
          .split(',')
          .map((n) => n.trim().replace(/^type\s+/, ''))
          .filter((n) => n && !names.includes('type ' + n) && /^[a-z]/.test(n))
        if (called.length > 0) offenders.push(`${path.relative(ROOT, file)} → ${called.join(', ')} from ${spec}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
