import { accessSync, constants } from 'fs'
import { execFile, execSync } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'

const execFileAsync = promisify(execFile)

const CANDIDATE_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  process.env.HOME ? join(process.env.HOME, '.local/bin') : null
].filter(Boolean)

function exists(path) {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function findBinary(name) {
  for (const dir of CANDIDATE_DIRS) {
    const p = join(dir, name)
    if (exists(p)) return p
  }
  try {
    const out = execSync(`command -v ${name}`, { encoding: 'utf8' }).trim()
    if (out && exists(out)) return out
  } catch {
    /* ignore */
  }
  return null
}

async function versionOf(bin, args = ['--version']) {
  if (!bin) return null
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 8000 })
    const text = (stdout || stderr || '').trim().split('\n')[0]
    return text || 'ok'
  } catch {
    return null
  }
}

export function resolveTools() {
  return {
    ytdlp: findBinary('yt-dlp'),
    ffmpeg: findBinary('ffmpeg'),
    ffprobe: findBinary('ffprobe')
  }
}

export async function toolsStatus() {
  const bins = resolveTools()
  const [ytdlpVer, ffmpegVer] = await Promise.all([
    versionOf(bins.ytdlp),
    versionOf(bins.ffmpeg, ['-version'])
  ])
  return {
    ytdlp: { path: bins.ytdlp, ok: !!bins.ytdlp && !!ytdlpVer, version: ytdlpVer },
    ffmpeg: { path: bins.ffmpeg, ok: !!bins.ffmpeg && !!ffmpegVer, version: ffmpegVer },
    hint: !bins.ytdlp || !bins.ffmpeg
      ? '터미널에서 brew install yt-dlp ffmpeg 를 실행한 뒤 앱을 다시 열어 주세요.'
      : null
  }
}

/** ffmpeg 필터 지원 여부 (결과 캐시) */
const filterCache = new Map()

export async function ffmpegHasFilter(ffmpegBin, filterName) {
  const key = `${ffmpegBin}::${filterName}`
  if (filterCache.has(key)) return filterCache.get(key)
  if (!ffmpegBin) {
    filterCache.set(key, false)
    return false
  }
  try {
    const { stdout, stderr } = await execFileAsync(ffmpegBin, ['-hide_banner', '-filters'], {
      timeout: 10000
    })
    const text = `${stdout || ''}\n${stderr || ''}`
    // 필터 목록 줄: "T. drawtext ..."
    const re = new RegExp(`(?:^|\\s)${filterName}(?:\\s|$)`, 'm')
    const ok = re.test(text)
    filterCache.set(key, ok)
    return ok
  } catch {
    filterCache.set(key, false)
    return false
  }
}
