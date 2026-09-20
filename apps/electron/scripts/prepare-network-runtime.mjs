import { chmod, copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import process from 'node:process'

const electronRoot = join(import.meta.dirname, '..')
const crateRoot = join(electronRoot, 'native', 'network-runtime')
const executableName = process.platform === 'win32'
  ? 'dsh-electron-network-runtime.exe'
  : 'dsh-electron-network-runtime'
const outputRoot = join(electronRoot, '.electron-build', 'network-runtime', 'current')

await runCargo(['build', '--release', '--manifest-path', join(crateRoot, 'Cargo.toml')])
await mkdir(outputRoot, { recursive: true })
const destination = join(outputRoot, executableName)
await copyFile(join(crateRoot, 'target', 'release', executableName), destination)
if (process.platform !== 'win32') await chmod(destination, 0o755)

function runCargo(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('cargo', args, { cwd: crateRoot, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`cargo ${args.join(' ')} exited with ${String(code)}`))
    })
  })
}
