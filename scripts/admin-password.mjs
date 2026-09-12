#!/usr/bin/env node
/**
 * Make the value for ADMIN_PASSWORD_HASH (admin sign-in, SEC-26a).
 *
 *   npm run admin:password
 *
 * Asks for the password without echoing it and prints a salted scrypt hash.
 * Store the hash as ADMIN_PASSWORD_HASH and your username as ADMIN_USERNAME.
 * The password itself is never written anywhere.
 *
 * Must stay in step with lib/adminCrypto.ts — tests/admin.test.ts checks.
 */
import { randomBytes, scrypt } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16)
    const N = 2 ** 15
    const r = 8
    const p = 1
    scrypt(password.normalize('NFKC'), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error
        ? reject(error)
        : resolve(['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join(':')),
    )
  })
}

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin
    process.stdout.write(question)
    if (!stdin.isTTY) {
      let data = ''
      stdin.setEncoding('utf8')
      stdin.on('data', (chunk) => (data += chunk))
      stdin.on('end', () => resolve(data.trim()))
      return
    }
    let value = ''
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.resume()
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.off('data', onData)
        process.stdout.write('\n')
        resolve(value)
      } else if (ch === '') {
        process.exit(130)
      } else if (ch === '') {
        value = value.slice(0, -1)
      } else {
        value += ch
      }
    }
    stdin.on('data', onData)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const password = process.env.ADMIN_PASSWORD ?? (await askHidden('Admin password (hidden): '))
  if (!password || password.length < 10) {
    console.error('Use at least 10 characters.')
    process.exit(1)
  }
  console.log(await hashPassword(password))
}
