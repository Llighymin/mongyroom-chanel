const { execSync } = require('child_process')
const { existsSync, rmSync, readFileSync } = require('fs')
const { join } = require('path')
const { platform } = require('os')

const root = join(__dirname, '..')
const moduleDir = join(root, 'node_modules', 'better-sqlite3')
const releaseNode = join(moduleDir, 'build', 'Release', 'better_sqlite3.node')

/**
 * Node가 Rosetta(x64)여도 Electron 바이너리 아키텍처를 따른다.
 * (Rosetta 세션의 `uname -m`은 x86_64로 나와 오탐하기 쉬움)
 */
function electronArch() {
  const electronBin = join(
    root,
    'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
  )
  if (existsSync(electronBin)) {
    const info = fileArch(electronBin)
    if (info.includes('arm64')) return 'arm64'
    if (info.includes('x86_64')) return 'x64'
  }
  if (platform() === 'darwin') {
    try {
      const arm = execSync('sysctl -n hw.optional.arm64', { encoding: 'utf8' }).trim()
      if (arm === '1') return 'arm64'
    } catch {
      /* ignore */
    }
  }
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

function electronVersion() {
  const pkg = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8'))
  return String(pkg.version).replace(/^v/, '')
}

function fileArch(path) {
  try {
    return execSync(`file "${path}"`, { encoding: 'utf8' })
  } catch {
    return ''
  }
}

function isCorrectArch(info, arch) {
  if (!info) return false
  if (arch === 'arm64') return info.includes('arm64') && !info.includes('x86_64')
  return info.includes('x86_64') || info.includes('x64')
}

const arch = electronArch()
const version = electronVersion()

if (!existsSync(moduleDir)) {
  console.log('[rebuild-native] better-sqlite3 not installed, skip')
  process.exit(0)
}

const current = existsSync(releaseNode) ? fileArch(releaseNode) : ''
if (isCorrectArch(current, arch)) {
  console.log(`[rebuild-native] ok electron@${version} ${arch} — ${current.trim()}`)
  process.exit(0)
}

console.log(`[rebuild-native] target electron@${version} arch=${arch}`)
if (current) console.log(`[rebuild-native] current: ${current.trim()}`)

if (existsSync(join(moduleDir, 'build'))) {
  rmSync(join(moduleDir, 'build'), { recursive: true, force: true })
}

const env = {
  ...process.env,
  npm_config_arch: arch,
  npm_config_target_arch: arch,
  npm_config_platform: 'darwin',
  npm_config_target_platform: 'darwin',
  PREBUILD_ARCH: arch
}

execSync(`npx prebuild-install -r electron -t ${version} -a ${arch} --verbose`, {
  stdio: 'inherit',
  cwd: moduleDir,
  env
})

const info = fileArch(releaseNode)
console.log(`[rebuild-native] installed: ${info.trim()}`)
if (!isCorrectArch(info, arch)) {
  console.error('[rebuild-native] ERROR: better-sqlite3 architecture mismatch. Electron window will fail.')
  process.exit(1)
}
