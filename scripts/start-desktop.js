import { findDesktopApplication } from './lib/desktop-paths.js'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const executable = await findDesktopApplication(root, metadata)
console.log(`Starting ${executable}`)
const child = process.platform === 'darwin'
  ? spawn('open', [executable], { stdio: 'inherit' })
  : spawn(executable, [], { stdio: 'inherit' })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
