import { createReadStream, existsSync, readFileSync, statSync } from 'fs'
import { BaseEngine } from '../base.js'
import { RUPLOAD, graphErrorMessage } from './graph.js'

/**
 * 인스타그램 파일 전송 엔진
 * 편집된 영상을 rupload로 전송한다. 가능하면 스트림, 실패 시 버퍼 폴백.
 */
export class IgTransferEngine extends BaseEngine {
  constructor() {
    super('인스타그램 파일 전송 엔진')
  }

  /**
   * @param {{ token: string, containerId: string, videoPath: string, uploadUri?: string|null }} input
   */
  async execute({ token, containerId, videoPath, uploadUri = null }) {
    if (!token || !containerId) throw new Error('업로드 세션 정보가 없어요.')
    if (!videoPath || !existsSync(videoPath)) throw new Error('전송할 영상 파일이 없어요.')

    const fileSize = statSync(videoPath).size
    const mb = Math.round((fileSize / 1024 / 1024) * 10) / 10

    this.progress(5, '영상을 인스타그램 서버로 보내고 있어요…', {
      taskId: 'transfer',
      taskStatus: 'running',
      detail: `${mb}MB 전송`
    })
    this.assertNotAborted()

    const headers = {
      Authorization: `OAuth ${token}`,
      offset: '0',
      file_size: String(fileSize),
      'Content-Type': 'application/octet-stream'
    }
    const url = uploadUri || `${RUPLOAD}/${containerId}`

    let uploadRes
    let uploadBody = {}
    try {
      uploadRes = await this._uploadStreaming(url, headers, videoPath)
      uploadBody = await uploadRes.json().catch(() => ({}))
    } catch (streamErr) {
      this.assertNotAborted()
      // duplex/stream 미지원 환경 폴백
      const buf = readFileSync(videoPath)
      this.assertNotAborted()
      try {
        uploadRes = await fetch(url, { method: 'POST', headers, body: buf })
        uploadBody = await uploadRes.json().catch(() => ({}))
      } catch (e) {
        this.assertNotAborted()
        throw new Error(e.message || streamErr.message || '영상 업로드 중 네트워크 오류가 났어요.')
      }
    }

    this.assertNotAborted()

    if (!uploadRes.ok) {
      throw new Error(graphErrorMessage(uploadBody, `영상 업로드 실패 (${uploadRes.status})`))
    }

    this.progress(100, '영상 전송이 끝났어요.', {
      taskId: 'transfer',
      taskStatus: 'done',
      detail: '전송 완료'
    })

    return { fileSize }
  }

  async _uploadStreaming(url, headers, videoPath) {
    const stream = createReadStream(videoPath)
    const abortOnCancel = () => {
      try {
        stream.destroy()
      } catch {
        /* ignore */
      }
    }
    if (this._signal) {
      if (this._signal.aborted) abortOnCancel()
      else this._signal.addEventListener('abort', abortOnCancel, { once: true })
    }
    try {
      return await fetch(url, {
        method: 'POST',
        headers,
        body: stream,
        duplex: 'half'
      })
    } finally {
      if (this._signal) this._signal.removeEventListener('abort', abortOnCancel)
    }
  }
}

export const igTransferEngine = new IgTransferEngine()
