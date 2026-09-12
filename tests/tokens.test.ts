import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'scripts'].includes(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const sourceFiles = walk(ROOT).filter(
  (f) => /\.(tsx?|css)$/.test(f) && !f.endsWith('tokens.css') && !f.includes('/tests/'),
)

describe('design token hygiene (plan.md rule 13)', () => {
  it('defines no raw hex colours outside tokens.css', () => {
    const offenders: string[] = []
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8')
      text.split('\n').forEach((line, i) => {
        // #ffffff is permitted where a fill's label must stay white regardless
        // of theme; those sites carry their measured ratio in a comment.
        if (/#[0-9a-fA-F]{6}\b/.test(line) && !/#ffffff/i.test(line) && !/#0b1120/i.test(line)) {
          offenders.push(`${file.replace(ROOT, '.')}:${i + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('never uses --text-subtle as a text colour (2.56:1, fails AA)', () => {
    const offenders: string[] = []
    for (const file of sourceFiles.filter((f) => f.endsWith('.css'))) {
      const text = readFileSync(file, 'utf8')
      text.split('\n').forEach((line, i) => {
        if (/(^|[^-])color:\s*var\(--text-subtle\)/.test(line)) {
          offenders.push(`${file.replace(ROOT, '.')}:${i + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('uses --border-interactive for control boundaries, not the decorative greys', () => {
    const css = readFileSync(join(ROOT, 'components/ui/Field.module.css'), 'utf8')
    expect(css).toContain('var(--border-interactive)')
  })
})
