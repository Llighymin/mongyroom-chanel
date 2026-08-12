import { mkdirSync, existsSync, copyFileSync } from 'fs'
import { basename, join } from 'path'
import { resolveTools } from '../tools.js'
import { jobDir } from '../mediaProtocol.js'
import { resolveWatermarkImagePath } from '../assets.js'
import { BaseEngine } from './base.js'
import { probeEngine } from './probeEngine.js'
import { buildCanvasFilter, overlayExpr } from './layoutEngine.js'
import { renderTextOverlayPng } from './overlayEngine.js'
import { normalizeEditOptions, REEL_W } from '../../shared/editOptions.js'

const MAX_SECONDS = 90

/**
 * 릴스 변환 엔진
 * 크롭 → 9:16 패딩(채우기 색) → 텍스트/워터마크 합성
 */
export class ReelConvertEngine extends BaseEngine {
  constructor() {
    super('릴스 변환 엔진')
  }

  async execute(input) {
    const { jobId, sourcePath, workspaceId } = input
    const { ffmpeg } = resolveTools()
    if (!ffmpeg) {
      throw new Error('ffmpeg가 설치되어 있지 않아요. brew install ffmpeg 후 다시 시도해 주세요.')
    }
    if (!sourcePath || !existsSync(sourcePath)) {
      throw new Error('원본 영상 파일이 없어요.')
    }

    const dir = jobDir(jobId)
    mkdirSync(dir, { recursive: true })
    const outputPath = join(dir, 'output.mp4')
    const maxSeconds = Number(input.maxSeconds) > 0 ? Number(input.maxSeconds) : MAX_SECONDS
    const opts = normalizeEditOptions(input.editOptions || input)

    const probed = await probeEngine.run({ sourcePath }, { signal: this._signal })
    const sourceDuration = Number(probed.duration) > 0 ? Number(probed.duration) : 0
    // 원본보다 길게 만들지 않고, 릴스 한도(90초)만 상한으로 둔다
    const outDuration = sourceDuration > 0
      ? Math.min(sourceDuration, maxSeconds)
      : maxSeconds
    const durationArg = outDuration.toFixed(3)
    const canvasFilter = buildCanvasFilter(opts.crop, opts.fill_color, probed.width, probed.height)

    const textItems = [...opts.texts]
    if (opts.watermark.on && opts.watermark.kind === 'text' && opts.watermark.text.trim()) {
      textItems.push({
        text: opts.watermark.text.trim(),
        x: opts.watermark.px,
        y: opts.watermark.py,
        size: opts.watermark.size || 36,
        color: opts.watermark.color || '#FFFFFF',
        font: opts.watermark.font,
        align: 'center',
        weight: opts.watermark.weight || 'semibold',
        shadow: opts.watermark.shadow !== false,
        stroke: opts.watermark.stroke !== false
      })
    }

    this.progress(8, '릴스 비율로 편집하고 있어요…', { detail: '레이어 준비' })
    const textPng = await renderTextOverlayPng(dir, textItems)

    let imageWm = null
    if (opts.watermark.on && opts.watermark.kind === 'image') {
      const resolved = resolveWatermarkImagePath(workspaceId, opts.watermark)
      if (!resolved) {
        throw new Error('워터마크 이미지 파일을 찾지 못했어요. 채널 설정에서 이미지를 다시 선택한 뒤 시도해 주세요.')
      }
      // job 폴더에 복사해 경로·권한 이슈를 피한다
      const localWm = join(dir, `wm${(basename(resolved).match(/\.[^.]+$/) || ['.png'])[0]}`)
      try {
        copyFileSync(resolved, localWm)
        imageWm = localWm
      } catch {
        imageWm = resolved
      }
    }

    // 원본·오버레이 모두 같은 길이로 읽어, 루프 이미지가 영상을 늘리지 않게 한다
    const inputs = ['-y', '-t', durationArg, '-i', sourcePath]
    if (textPng) inputs.push('-loop', '1', '-t', durationArg, '-i', textPng)
    if (imageWm) inputs.push('-loop', '1', '-t', durationArg, '-i', imageWm)

    let filter = `[0:v]${canvasFilter}[base]`
    let last = 'base'
    let idx = 1
    if (textPng) {
      filter += `;[${last}][${idx}:v]overlay=0:0:format=auto:shortest=1:eof_action=endall[txt]`
      last = 'txt'
      idx += 1
    }
    if (imageWm) {
      const ow = Math.max(40, Math.round(REEL_W * (opts.watermark.scale || 0.22)))
      const pos = overlayExpr(opts.watermark.px, opts.watermark.py)
      filter += `;[${idx}:v]scale=${ow}:-1[wm];[${last}][wm]overlay=x=${pos.x}:y=${pos.y}:format=auto:shortest=1:eof_action=endall[outv]`
      last = 'outv'
    }

    this.progress(12, '릴스 비율로 편집하고 있어요…', {
      detail: '변환 시작',
      watermarkOn: opts.watermark.on,
      duration: outDuration
    })

    const args = [
      ...inputs,
      '-filter_complex', filter,
      '-map', `[${last}]`,
      '-map', '0:a?',
      '-t', durationArg,
      '-shortest',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      outputPath
    ]

    let lastPct = 12
    const { code, stderr } = await this.spawnTracked(ffmpeg, args, {
      onStderr: (chunk) => {
        const m = chunk.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
        if (!m) return
        const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
        const pct = Math.min(95, 12 + Math.round((sec / outDuration) * 83))
        if (pct > lastPct) {
          lastPct = pct
          this.progress(pct, '릴스 비율로 편집하고 있어요…', {
            detail: `${Math.min(Math.round(outDuration), Math.round(sec))}초 처리 중`
          })
        }
      }
    })

    if (code !== 0) {
      const tail = stderr.trim().split('\n').slice(-4).join(' ')
      throw new Error(tail || `편집 실패 (코드 ${code})`)
    }
    if (!existsSync(outputPath)) {
      throw new Error('편집된 영상 파일을 만들지 못했어요.')
    }

    this.progress(100, '편집이 끝났어요.', { detail: '변환 완료' })
    return { outputPath, sourceSize: probed }
  }
}

export const reelConvertEngine = new ReelConvertEngine()
