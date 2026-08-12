import { toolsStatus, resolveTools } from '../tools.js'
import { BaseEngine } from './base.js'

/**
 * 편집 도구 확인 엔진
 * yt-dlp · ffmpeg 설치/실행 가능 여부를 검사한다.
 */
export class ToolsCheckEngine extends BaseEngine {
  constructor() {
    super('편집 도구 확인 엔진')
  }

  /**
   * @returns {Promise<{ ytdlp: object, ffmpeg: object, bins: { ytdlp: string|null, ffmpeg: string|null } }>}
   */
  async execute() {
    this.progress(0, '편집 도구를 확인하고 있어요…', { detail: '설치 여부 확인 중' })
    this.assertNotAborted()

    const status = await toolsStatus()
    this.assertNotAborted()

    if (!status.ytdlp.ok || !status.ffmpeg.ok) {
      const err = new Error(status.hint || 'yt-dlp와 ffmpeg가 필요해요.')
      err.code = 'TOOLS_MISSING'
      err.tools = status
      throw err
    }

    this.progress(100, '편집 도구가 준비됐어요.', { detail: '준비됨' })
    return {
      ytdlp: status.ytdlp,
      ffmpeg: status.ffmpeg,
      bins: resolveTools()
    }
  }
}

export const toolsCheckEngine = new ToolsCheckEngine()
