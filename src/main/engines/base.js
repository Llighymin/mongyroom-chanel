import { spawn } from 'child_process'

/**
 * 릴스 파이프라인 엔진 공통 기반.
 * - 진행률 콜백
 * - AbortSignal 취소
 * - 자식 프로세스 추적·종료
 */
export class BaseEngine {
  /** @param {string} name 엔진 표시명 */
  constructor(name) {
    this.name = name
    /** @type {import('child_process').ChildProcess[]} */
    this._children = []
    /** @type {AbortSignal | null} */
    this._signal = null
    this._aborted = false
  }

  get aborted() {
    return this._aborted || this._signal?.aborted === true
  }

  /**
   * @param {object} [ctx]
   * @param {(pct: number, message: string, meta?: object) => void} [ctx.onProgress]
   * @param {AbortSignal} [ctx.signal]
   */
  bindContext(ctx = {}) {
    this._onProgress = typeof ctx.onProgress === 'function' ? ctx.onProgress : () => {}
    this._signal = ctx.signal || null
    this._aborted = false
    if (this._signal) {
      if (this._signal.aborted) {
        this._aborted = true
      } else {
        this._abortHandler = () => {
          this._aborted = true
          this.killChildren()
        }
        this._signal.addEventListener('abort', this._abortHandler, { once: true })
      }
    }
  }

  unbindContext() {
    if (this._signal && this._abortHandler) {
      this._signal.removeEventListener('abort', this._abortHandler)
    }
    this._signal = null
    this._abortHandler = null
    this._children = []
  }

  progress(pct, message, meta = {}) {
    this._onProgress?.(pct, message, meta)
  }

  assertNotAborted() {
    if (this.aborted) {
      const err = new Error(`${this.name}이(가) 취소되었어요.`)
      err.code = 'ABORTED'
      throw err
    }
  }

  /**
   * 자식 프로세스 실행. 취소 시 kill.
   * @returns {Promise<{ code: number|null, stdout: string, stderr: string }>}
   */
  spawnTracked(bin, args, { env = process.env, onStdout, onStderr } = {}) {
    this.assertNotAborted()
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { env: { ...env } })
      this._children.push(child)
      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (buf) => {
        const text = buf.toString()
        stdout += text
        onStdout?.(text)
      })
      child.stderr?.on('data', (buf) => {
        const text = buf.toString()
        stderr += text
        onStderr?.(text)
      })
      child.on('error', (err) => {
        this._detachChild(child)
        reject(err)
      })
      child.on('close', (code) => {
        this._detachChild(child)
        if (this.aborted) {
          const err = new Error(`${this.name}이(가) 취소되었어요.`)
          err.code = 'ABORTED'
          reject(err)
          return
        }
        resolve({ code, stdout, stderr })
      })
    })
  }

  killChildren() {
    for (const child of [...this._children]) {
      try {
        if (!child.killed) child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      try {
        setTimeout(() => {
          try {
            if (!child.killed) child.kill('SIGKILL')
          } catch {
            /* ignore */
          }
        }, 1500)
      } catch {
        /* ignore */
      }
    }
  }

  _detachChild(child) {
    this._children = this._children.filter((c) => c !== child)
  }

  /**
   * 엔진 실행 엔트리. 하위 클래스는 `execute`를 구현.
   * @param {object} input
   * @param {object} [ctx]
   */
  async run(input, ctx = {}) {
    this.bindContext(ctx)
    try {
      this.assertNotAborted()
      return await this.execute(input)
    } finally {
      this.unbindContext()
    }
  }

  /** @param {object} _input */
  async execute(_input) {
    throw new Error(`${this.name}: execute()가 구현되지 않았어요.`)
  }
}

export function createAbortError(name = '작업') {
  const err = new Error(`${name}이(가) 취소되었어요.`)
  err.code = 'ABORTED'
  return err
}
