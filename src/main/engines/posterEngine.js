import { existsSync } from 'fs'
import { join } from 'path'
import { resolveTools } from '../tools.js'
import { jobDir } from '../mediaProtocol.js'
import { BaseEngine } from './base.js'

/**
 * 편집 미리보기용 썸네일(한 장)을 뽑는다.
 */
export class PosterEngine extends BaseEngine {
  constructor() {
    super('썸네일 추출 엔진')
  }

  /**
   * @param {{ jobId: string|number, sourcePath: string, force?: boolean }} input
   * @returns {Promise<{ thumbPath: string }>}
   */
  async execute({ jobId, sourcePath, force = false }) {
    const { ffmpeg } = resolveTools()
    const dir = jobDir(jobId)
    const thumbPath = join(dir, 'thumb.jpg')
    if (!force && existsSync(thumbPath)) return { thumbPath }
    if (!ffmpeg) return { thumbPath: existsSync(thumbPath) ? thumbPath : '' }
    if (!sourcePath || !existsSync(sourcePath)) return { thumbPath: '' }

    this.progress(10, '미리보기 장면을 만들고 있어요…', { detail: '썸네일' })
    const { code } = await this.spawnTracked(ffmpeg, [
      '-y',
      '-ss', '0.8',
      '-i', sourcePath,
      '-frames:v', '1',
      '-vf', 'scale=540:-2',
      '-q:v', '4',
      thumbPath
    ])
    if (code !== 0 || !existsSync(thumbPath)) {
      return { thumbPath: existsSync(thumbPath) ? thumbPath : '' }
    }
    this.progress(100, '미리보기 장면을 준비했어요.', { detail: '썸네일' })
    return { thumbPath }
  }
}

export const posterEngine = new PosterEngine()
