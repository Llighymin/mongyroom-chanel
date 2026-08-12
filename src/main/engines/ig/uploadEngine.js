import { BaseEngine } from '../base.js'
import { igPrepareEngine } from './prepareEngine.js'
import { igTransferEngine } from './transferEngine.js'
import { igProcessEngine } from './processEngine.js'
import { igPublishEngine } from './publishEngine.js'

/**
 * 인스타그램 릴스 업로드 오케스트레이션 엔진
 * 준비 → 전송 → 처리 대기 → 게시를 순서대로 실행한다.
 */
export class IgUploadEngine extends BaseEngine {
  constructor() {
    super('인스타그램 릴스 업로드 엔진')
  }

  /**
   * @param {{
   *   accountId: number|string,
   *   videoPath: string,
   *   caption?: string,
   *   shareToFeed?: boolean
   * }} input
   */
  async execute(input) {
    const { accountId, videoPath, caption = '', shareToFeed = true } = input
    const ctx = { onProgress: this._onProgress, signal: this._signal }

    const prepared = await igPrepareEngine.run(
      { accountId, caption, shareToFeed },
      {
        ...ctx,
        onProgress: (pct, message, meta) => {
          this.progress(Math.round(pct * 0.2), message, meta)
        }
      }
    )
    this.assertNotAborted()

    await igTransferEngine.run(
      {
        token: prepared.token,
        containerId: prepared.containerId,
        uploadUri: prepared.uploadUri,
        videoPath
      },
      {
        ...ctx,
        onProgress: (pct, message, meta) => {
          this.progress(20 + Math.round(pct * 0.35), message, meta)
        }
      }
    )
    this.assertNotAborted()

    await igProcessEngine.run(
      {
        token: prepared.token,
        containerId: prepared.containerId
      },
      {
        ...ctx,
        onProgress: (pct, message, meta) => {
          this.progress(55 + Math.round(pct * 0.35), message, meta)
        }
      }
    )
    this.assertNotAborted()

    const published = await igPublishEngine.run(
      {
        token: prepared.token,
        igUserId: prepared.account.ig_user_id,
        containerId: prepared.containerId
      },
      {
        ...ctx,
        onProgress: (pct, message, meta) => {
          this.progress(90 + Math.round(pct * 0.1), message, meta)
        }
      }
    )

    return {
      containerId: prepared.containerId,
      publishedId: published.publishedId
    }
  }
}

export const igUploadEngine = new IgUploadEngine()
