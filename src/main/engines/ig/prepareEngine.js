import { getSecret } from '../../secrets.js'
import { getAccount } from '../../db.js'
import { BaseEngine } from '../base.js'
import { GRAPH, graphErrorMessage, graphJson } from './graph.js'

/**
 * 인스타그램 업로드 준비 엔진
 * REELS resumable 컨테이너를 생성한다.
 */
export class IgPrepareEngine extends BaseEngine {
  constructor() {
    super('인스타그램 업로드 준비 엔진')
  }

  /**
   * @param {{ accountId: number|string, caption?: string, shareToFeed?: boolean }} input
   * @returns {Promise<{ account: object, token: string, containerId: string }>}
   */
  async execute({ accountId, caption = '', shareToFeed = true }) {
    this.progress(10, '인스타그램에 올릴 준비를 하고 있어요…', {
      taskId: 'prepare',
      taskStatus: 'running',
      detail: '업로드 세션 생성'
    })

    const account = getAccount(accountId)
    if (!account) throw new Error('업로드할 계정을 찾을 수 없어요.')
    if (!account.ig_user_id) {
      throw new Error('인스타그램 사용자 ID가 비어 있어요. 채널 설정에서 계정을 확인해 주세요.')
    }

    const token = getSecret(`meta_token:${accountId}`)
    if (!token) {
      throw new Error('이 계정에 저장된 액세스 토큰이 없어요. 채널 설정에서 토큰을 다시 저장해 주세요.')
    }

    this.assertNotAborted()

    const createUrl = new URL(`${GRAPH}/${account.ig_user_id}/media`)
    createUrl.searchParams.set('media_type', 'REELS')
    createUrl.searchParams.set('upload_type', 'resumable')
    createUrl.searchParams.set('caption', caption || '')
    createUrl.searchParams.set('share_to_feed', shareToFeed ? 'true' : 'false')
    createUrl.searchParams.set('access_token', token)

    const { res, body } = await graphJson(createUrl.toString(), { method: 'POST' })
    this.assertNotAborted()

    if (!res.ok || !body.id) {
      throw new Error(graphErrorMessage(body, `컨테이너 생성 실패 (${res.status})`))
    }

    this.progress(100, '업로드 준비가 끝났어요.', {
      taskId: 'prepare',
      taskStatus: 'done',
      detail: '준비 완료'
    })

    return {
      account,
      token,
      containerId: body.id,
      uploadUri: body.uri || null
    }
  }
}

export const igPrepareEngine = new IgPrepareEngine()
