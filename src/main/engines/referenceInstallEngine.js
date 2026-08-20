import { mkdirSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { resolveTools, ytdlpMergeOptions } from '../tools.js'
import { jobDir } from '../mediaProtocol.js'
import { BaseEngine } from './base.js'

/**
 * 레퍼런스 영상 설치 엔진
 * yt-dlp로 원본 URL을 job 폴더에 내려받는다.
 */
export class ReferenceInstallEngine extends BaseEngine {
  constructor() {
    super('레퍼런스 영상 설치 엔진')
  }

  /**
   * @param {{ jobId: string|number, url: string }} input
   * @returns {Promise<{ sourcePath: string }>}
   */
  async execute({ jobId, url }) {
    const { ytdlp, ffmpeg } = resolveTools()
    if (!ytdlp) {
      throw new Error('yt-dlp가 설치되어 있지 않아요. brew install yt-dlp 후 다시 시도해 주세요.')
    }
    if (!ffmpeg) {
      throw new Error('ffmpeg가 설치되어 있지 않아요. 영상과 소리를 합치려면 필요해요. brew install ffmpeg 후 다시 시도해 주세요.')
    }
    if (!url || typeof url !== 'string') {
      throw new Error('영상 주소가 없어요.')
    }

    const dir = jobDir(jobId)
    mkdirSync(dir, { recursive: true })
    const outTemplate = join(dir, 'source.%(ext)s')
    const merge = ytdlpMergeOptions()

    this.progress(2, '영상을 내려받는 중이에요…', { detail: '연결 중' })

    const args = [
      url,
      '-o', outTemplate,
      '--no-playlist',
      '--newline',
      ...merge.args,
      // 비디오 전용 mp4로 떨어지지 않게, 반드시 영상+소리를 합친다
      '-f', 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b',
      '--merge-output-format', 'mp4',
      '--restrict-filenames',
      '--no-warnings'
    ]

    const reportPct = (raw) => {
      const n = Number(raw)
      if (!Number.isFinite(n)) return
      const pct = Math.min(95, Math.max(2, Math.round(n)))
      this.progress(pct, `영상을 내려받는 중이에요… ${Math.round(n)}%`, {
        detail: `${Math.round(n)}% 완료`
      })
    }

    const { code, stderr } = await this.spawnTracked(ytdlp, args, {
      env: merge.env,
      onStdout: (line) => {
        const m = line.match(/(\d+(?:\.\d+)?)%/)
        if (m) reportPct(m[1])
      },
      onStderr: (line) => {
        const m = line.match(/(\d+(?:\.\d+)?)%/)
        if (m) reportPct(m[1])
      }
    })

    if (code !== 0) {
      const tail = stderr.trim().split('\n').slice(-3).join(' ')
      const hint = /instagram/i.test(url)
        ? ' 인스타그램 주소는 내려받기 제한이 있을 수 있어요. 유튜브 주소나 직접 올린 파일을 사용해 보세요.'
        : ''
      throw new Error((tail || `다운로드 실패 (코드 ${code})`) + hint)
    }

    const found = findSourceFile(dir)
    if (!found) {
      throw new Error('내려받은 영상 파일을 찾지 못했어요.')
    }

    this.progress(100, '다운로드가 끝났어요.', { detail: '원본 저장 완료' })
    return { sourcePath: found }
  }
}

function findSourceFile(dir) {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter((f) => f.startsWith('source.'))
  const preferred = files.find((f) => f.endsWith('.mp4')) || files[0]
  if (!preferred) return null
  const path = join(dir, preferred)
  return existsSync(path) ? path : null
}

export const referenceInstallEngine = new ReferenceInstallEngine()
