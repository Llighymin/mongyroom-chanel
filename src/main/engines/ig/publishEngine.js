import { BaseEngine } from '../base.js'
import { graphBaseForToken, graphErrorMessage, graphJson } from './graph.js'

/**
 * 인스타그램 릴스 게시 엔진
 * media_publish로 컨테이너를 실제 릴스로 게시한다.
 */
export class IgPublishEngine extends BaseEngine {
  constructor() {
    super('인스타그램 릴스 게시 엔진')
  }

  /**
   * @param {{ token: string, igUserId: string, containerId: string }} input
   * @returns {Promise<{ publishedId: string, containerId: string }>}
   */
  async execute({ token, igUserId, containerId }) {
    if (!token || !igUserId || !containerId) {
      throw new Error('게시에 필요한 정보가 부족해요.')
    }

    this.progress(20, '릴스를 게시하고 있어요…', {
      taskId: 'publish',
      taskStatus: 'running',
      detail: '게시 요청'
    })
    this.assertNotAborted()

    const graphBase = graphBaseForToken(token)

    const pubUrl = new URL(`${graphBase}/${igUserId}/media_publish`)
    pubUrl.searchParams.set('creation_id', containerId)
    pubUrl.searchParams.set('access_token', token)

    const { res, body } = await graphJson(pubUrl.toString(), { method: 'POST' })
    this.assertNotAborted()

    if (!res.ok || !body.id) {
      throw new Error(graphErrorMessage(body, `게시 실패 (${res.status})`))
    }

    this.progress(100, '릴스 게시를 완료했어요.', {
      taskId: 'publish',
      taskStatus: 'done',
      detail: '게시 완료'
    })

    return { publishedId: body.id, containerId }
  }
}

export const igPublishEngine = new IgPublishEngine()
