import { BaseEngine } from '../base.js'
import { GRAPH, graphJson, sleep } from './graph.js'

/**
 * 인스타그램 처리 대기 엔진
 * 컨테이너 status_code가 FINISHED가 될 때까지 폴링한다.
 */
export class IgProcessEngine extends BaseEngine {
  constructor() {
    super('인스타그램 처리 대기 엔진')
  }

  /**
   * @param {{
   *   token: string,
   *   containerId: string,
   *   maxAttempts?: number,
   *   intervalMs?: number
   * }} input
   */
  async execute({ token, containerId, maxAttempts = 60, intervalMs = 3000 }) {
    if (!token || !containerId) throw new Error('처리 대기할 세션 정보가 없어요.')

    this.progress(5, '인스타그램이 영상을 처리하고 있어요…', {
      taskId: 'process',
      taskStatus: 'running',
      detail: '처리 대기'
    })

    for (let i = 0; i < maxAttempts; i++) {
      this.assertNotAborted()
      await sleep(intervalMs)
      this.assertNotAborted()

      const stUrl =
        `${GRAPH}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`
      const { body } = await graphJson(stUrl)
      const code = body.status_code
      const pct = Math.min(95, 5 + Math.round(((i + 1) / maxAttempts) * 90))

      this.progress(
        pct,
        code === 'IN_PROGRESS' || !code
          ? '인스타그램이 영상을 처리하고 있어요…'
          : `처리 상태: ${code}`,
        {
          taskId: 'process',
          taskStatus: 'running',
          detail: code || '확인 중'
        }
      )

      if (code === 'FINISHED') {
        this.progress(100, '인스타그램 처리가 끝났어요.', {
          taskId: 'process',
          taskStatus: 'done',
          detail: '처리 완료'
        })
        return { statusCode: code }
      }
      if (code === 'ERROR' || code === 'EXPIRED') {
        throw new Error(body.status || '인스타그램 영상 처리에 실패했어요.')
      }
    }

    throw new Error('인스타그램 처리 시간이 너무 길어요. 잠시 후 다시 시도해 주세요.')
  }
}

export const igProcessEngine = new IgProcessEngine()
