import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, dirname } from 'path'
import { resolveTools } from '../tools.js'
import { BaseEngine } from './base.js'

const execFileAsync = promisify(execFile)

/**
 * 원본 영상 가로·세로·길이를 읽는다.
 */
export class ProbeEngine extends BaseEngine {
  constructor() {
    super('영상 정보 확인 엔진')
  }

  async execute({ sourcePath }) {
    if (!sourcePath || !existsSync(sourcePath)) {
      throw new Error('원본 영상 파일이 없어요.')
    }
    this.progress(20, '영상 크기를 확인하고 있어요…', { detail: '해상도 확인' })

    const { ffmpeg, ffprobe } = resolveTools()
    const sibling = ffmpeg ? join(dirname(ffmpeg), 'ffprobe') : null
    const probeBin = (ffprobe && existsSync(ffprobe) && ffprobe) || (sibling && existsSync(sibling) && sibling) || null

    if (probeBin) {
      try {
        const { stdout } = await execFileAsync(
          probeBin,
          [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,duration',
            '-show_entries', 'format=duration',
            '-of', 'json',
            sourcePath
          ],
          { timeout: 15000 }
        )
        const info = JSON.parse(String(stdout || '{}'))
        const stream = info?.streams?.[0] || {}
        const width = Number(stream.width)
        const height = Number(stream.height)
        const duration = pickDuration(stream.duration, info?.format?.duration)
        if (width > 0 && height > 0) {
          const hasAudio = await detectAudio(probeBin, sourcePath)
          this.progress(100, '영상 정보를 확인했어요.', {
            detail: duration ? `${width}×${height} · ${duration.toFixed(1)}초` : `${width}×${height}`
          })
          return { width, height, duration, hasAudio }
        }
      } catch {
        /* csv 방식으로 한 번 더 */
      }

      const { stdout } = await execFileAsync(
        probeBin,
        ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', sourcePath],
        { timeout: 15000 }
      )
      const m = String(stdout).trim().match(/(\d+)x(\d+)/)
      if (m) {
        const hasAudio = await detectAudio(probeBin, sourcePath)
        this.progress(100, '영상 정보를 확인했어요.', { detail: `${m[1]}×${m[2]}` })
        return { width: Number(m[1]), height: Number(m[2]), duration: 0, hasAudio }
      }
    }

    if (!ffmpeg) throw new Error('ffmpeg가 없어 영상 크기를 확인할 수 없어요.')
    try {
      await execFileAsync(ffmpeg, ['-i', sourcePath], { timeout: 15000 })
    } catch (e) {
      const text = `${e?.stderr || e?.message || ''}`
      const m = text.match(/Stream #0:\d+.+: Video:.*?(\d{2,5})x(\d{2,5})/)
      const d = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      let duration = 0
      if (d) {
        duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3])
      }
      if (m) {
        this.progress(100, '영상 정보를 확인했어요.', { detail: `${m[1]}×${m[2]}` })
        return { width: Number(m[1]), height: Number(m[2]), duration, hasAudio: /Audio:/i.test(text) }
      }
    }

    throw new Error('영상 가로·세로를 읽지 못했어요.')
  }
}

async function detectAudio(probeBin, sourcePath) {
  try {
    const { stdout } = await execFileAsync(
      probeBin,
      ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', sourcePath],
      { timeout: 15000 }
    )
    return String(stdout || '').trim().length > 0
  } catch {
    return false
  }
}

function pickDuration(...values) {
  for (const v of values) {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

export const probeEngine = new ProbeEngine()
