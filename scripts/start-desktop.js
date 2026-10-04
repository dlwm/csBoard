import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const name = metadata.build.productName
const directory = process.platform === 'darwin' ? `mac${process.arch === 'x64' ? '' : `-${process.arch}`}`
  : process.platform === 'win32' ? `win${process.arch === 'x64' ? '' : `-${process.arch}`}-unpacked`
    : `linux${process.arch === 'x64' ? '' : `-${process.arch}`}-unpacked`
const filename = process.platform === 'darwin' ? `${name}.app` : process.platform === 'win32' ? `${name}.exe` : metadata.name.toLowerCase()
const executable = path.join(root, metadata.build.directories.output, directory, filename)
try { await fs.access(executable) }
catch { throw new Error('CSBoard application is not built yet. Run make desktop-prepare once, then make desktop-start.') }
const child = process.platform === 'darwin'
  ? spawn('open', ['-W', executable], { stdio: 'inherit' })
  : spawn(executable, [], { stdio: 'inherit' })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
