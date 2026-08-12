import { BrowserWindow } from 'electron'
import { existsSync, statSync } from 'fs'
import { basename } from 'path'
import {
  getJob, updateJob, getReference, updateReference, cancelJob as cancelJobDb, getWorkspace, getAccount
} from '../db.js'
import { mediaUrlFor, previewFileExists, previewFileMtime } from '../mediaProtocol.js'
import { assetUrlFor, resolveWatermarkImagePath } from '../assets.js'
import { resolveEditOptions } from '../../shared/editOptions.js'
import { getSecret } from '../secrets.js'
import {
  toolsCheckEngine,
  referenceInstallEngine,
  reelConvertEngine,
  igUploadEngine
} from '../engines/index.js'
import { posterEngine } from '../engines/posterEngine.js'

/** @type {Map<number|string, AbortController>} */
const controllers = new Map()

function emitProgress(job) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('jobs:progress', enrichJob(job))
  }
}

export function enrichJob(job) {
  if (!job) return null
  const ref = job.reference_id ? getReference(job.reference_id) : null
  const hasOutput = !!(job.output_path && previewFileExists(job.id, 'output.mp4'))
  const mtime = hasOutput ? previewFileMtime(job.id, 'output.mp4') : null
  const sourceName = job.source_path ? basename(job.source_path) : ''
  const hasSource = !!(job.source_path && existsSync(job.source_path) && sourceName)
  let sourceMtime = null
  if (hasSource) {
    try {
      sourceMtime = String(statSync(job.source_path).mtimeMs)
    } catch {
      sourceMtime = null
    }
  }

  const wm = job.edit_options?.watermark
  let watermark_preview_url = null
  if (wm?.kind === 'image' && job.workspace_id) {
    const resolved = resolveWatermarkImagePath(job.workspace_id, wm)
    if (resolved) {
      const fname = basename(resolved)
      try {
        watermark_preview_url = assetUrlFor(job.workspace_id, fname, String(statSync(resolved).mtimeMs))
      } catch {
        watermark_preview_url = assetUrlFor(job.workspace_id, fname)
      }
    }
  }

  return {
    ...job,
    reference: ref
      ? {
          id: ref.id,
          title: ref.title,
          url: ref.url,
          source: ref.source,
          author: ref.author,
          thumbnail_url: ref.thumbnail_url
        }
      : null,
    preview_ready: hasOutput,
    preview_url: hasOutput ? mediaUrlFor(job.id, 'output.mp4', mtime) : null,
    source_ready: hasSource,
    source_url: hasSource ? mediaUrlFor(job.id, sourceName, sourceMtime) : null,
    thumb_url: previewFileExists(job.id, 'thumb.jpg')
      ? mediaUrlFor(job.id, 'thumb.jpg', previewFileMtime(job.id, 'thumb.jpg'))
      : null,
    watermark_preview_url
  }
}

function makeTasks(defs) {
  return defs.map((d) => ({
    id: d.id,
    label: d.label,
    status: d.status || 'pending',
    detail: d.detail || '',
    at: new Date().toISOString()
  }))
}

function buildEditTasks(opts, { skipDownload = false } = {}) {
  const wmOn = !!opts?.watermark?.on
  const textsOn = Array.isArray(opts?.texts) && opts.texts.length > 0
  return makeTasks([
    { id: 'tools', label: '편집 도구 확인 (yt-dlp · ffmpeg)' },
    skipDownload
      ? { id: 'download', label: '원본 영상 내려받기', status: 'skipped', detail: '이미 있음' }
      : { id: 'download', label: '원본 영상 내려받기' },
    { id: 'convert', label: '영역 추출 · 세로(9:16) 맞추기' },
    wmOn
      ? { id: 'watermark', label: '워터마크 넣기' }
      : { id: 'watermark', label: '워터마크 넣기', status: 'skipped', detail: '사용 안 함' },
    textsOn
      ? { id: 'texts', label: '추가 문구 넣기' }
      : { id: 'texts', label: '추가 문구 넣기', status: 'skipped', detail: '없음' },
    { id: 'save', label: '릴스용 파일 저장' }
  ])
}

function buildUploadTasks() {
  return makeTasks([
    { id: 'prepare', label: '인스타그램 업로드 준비' },
    { id: 'transfer', label: '편집된 영상 파일 전송' },
    { id: 'process', label: '인스타그램 영상 처리 대기' },
    { id: 'publish', label: '릴스 게시' }
  ])
}

function setTask(log, taskId, status, detail) {
  const list = Array.isArray(log) ? log.map((t) => ({ ...t })) : []
  const idx = list.findIndex((t) => t.id === taskId)
  const at = new Date().toISOString()
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      status,
      detail: detail !== undefined ? detail : list[idx].detail,
      at
    }
  } else {
    list.push({ id: taskId, label: taskId, status, detail: detail || '', at })
  }
  return list
}

async function patch(jobId, fields) {
  const job = updateJob(jobId, fields)
  emitProgress(job)
  return job
}

async function setActivity(jobId, taskId, status, detail, extra = {}) {
  const cur = getJob(jobId)
  const activity_log = setTask(cur?.activity_log, taskId, status, detail)
  return patch(jobId, { ...extra, activity_log })
}

function mapDownloadProgress(enginePct) {
  return Math.min(48, Math.round(8 + enginePct * 0.4))
}

function mapConvertProgress(enginePct) {
  return Math.min(95, Math.round(52 + enginePct * 0.43))
}

export async function prepareSource(jobId) {
  if (controllers.has(jobId)) return enrichJob(getJob(jobId))
  const job = getJob(jobId)
  if (!job) throw new Error('작업을 찾을 수 없어요.')
  if (job.source_path && existsSync(job.source_path)) {
    await posterEngine.run({ jobId, sourcePath: job.source_path }).catch(() => null)
    return enrichJob(getJob(jobId) || job)
  }

  const ac = new AbortController()
  controllers.set(jobId, ac)
  try {
    await patch(jobId, {
      progress: 2,
      message: '원본 영상을 내려받고 있어요…',
      error: '',
      activity_log: makeTasks([
        { id: 'download', label: '원본 영상 내려받기', status: 'running', detail: '시작' }
      ])
    })
    const ref = getReference(job.reference_id)
    if (!ref?.url) throw new Error('레퍼런스에 영상 주소가 없어요.')

    const { sourcePath } = await referenceInstallEngine.run(
      { jobId, url: ref.url },
      {
        signal: ac.signal,
        onProgress: (enginePct, _message, meta = {}) => {
          const progress = Math.min(95, Math.round(enginePct))
          const activity_log = setTask(
            getJob(jobId)?.activity_log,
            'download',
            'running',
            meta.detail || `${progress}%`
          )
          patch(jobId, {
            progress,
            message: '원본 영상을 내려받고 있어요…',
            activity_log
          })
        }
      }
    )

    await posterEngine.run({ jobId, sourcePath }, { signal: ac.signal }).catch(() => null)

    const done = await setActivity(jobId, 'download', 'done', '원본 저장 완료', {
      source_path: sourcePath,
      progress: 100,
      message: '원본을 불러왔어요. 영역을 고른 뒤 편집을 시작해 주세요.',
      error: ''
    })
    return enrichJob(done)
  } catch (e) {
    if (e?.code === 'ABORTED') return enrichJob(getJob(jobId))
    const failed = await patch(jobId, {
      progress: 0,
      message: '원본을 불러오지 못했어요.',
      error: e.message || String(e),
      activity_log: setTask(getJob(jobId)?.activity_log, 'download', 'error', e.message || String(e))
    })
    throw Object.assign(new Error(e.message || String(e)), { job: enrichJob(failed) })
  } finally {
    controllers.delete(jobId)
  }
}

export async function startEdit(jobId, editOptions = {}) {
  if (controllers.has(jobId)) throw new Error('이미 이 작업을 처리하고 있어요.')
  const job = getJob(jobId)
  if (!job) throw new Error('작업을 찾을 수 없어요.')
  if (!['select', 'edit', 'failed', 'confirm'].includes(job.stage)) {
    throw new Error('지금은 편집을 시작할 수 없는 단계예요.')
  }

  const workspace = getWorkspace(job.workspace_id)
  const opts = resolveEditOptions(editOptions, workspace || { name: 'Studio', default_edit_options: {} })
  if (opts.watermark.on && opts.watermark.kind === 'image') {
    const resolved = resolveWatermarkImagePath(job.workspace_id, opts.watermark)
    if (!resolved) {
      throw new Error('워터마크 이미지 파일을 찾지 못했어요. 채널 설정에서 이미지를 다시 선택한 뒤 시도해 주세요.')
    }
    opts.watermark.image_path = resolved
    opts.watermark.image_file = basename(resolved)
  }
  const hasSource = !!(job.source_path && existsSync(job.source_path))

  const ac = new AbortController()
  controllers.set(jobId, ac)

  try {
    await patch(jobId, {
      stage: 'edit',
      edit_options: opts,
      progress: 1,
      message: '편집 작업을 준비하고 있어요…',
      error: '',
      output_path: '',
      activity_log: buildEditTasks(opts, { skipDownload: hasSource })
    })

    await setActivity(jobId, 'tools', 'running', '설치 여부 확인 중', {
      progress: 3,
      message: '편집 도구를 확인하고 있어요…'
    })
    await toolsCheckEngine.run(
      {},
      {
        signal: ac.signal,
        onProgress: (_p, message, meta = {}) => {
          patch(jobId, {
            progress: 4,
            message,
            activity_log: setTask(getJob(jobId)?.activity_log, 'tools', 'running', meta.detail || message)
          })
        }
      }
    )
    await setActivity(jobId, 'tools', 'done', '준비됨', {
      progress: 6,
      message: '편집 도구가 준비됐어요.'
    })

    let sourcePath = hasSource ? job.source_path : ''
    if (!sourcePath) {
      const ref = getReference(job.reference_id)
      if (!ref?.url) throw new Error('레퍼런스에 영상 주소가 없어요.')

      await setActivity(jobId, 'download', 'running', '다운로드 시작', {
        progress: 8,
        message: '원본 영상을 내려받고 있어요…'
      })

      const installed = await referenceInstallEngine.run(
        { jobId, url: ref.url },
        {
          signal: ac.signal,
          onProgress: (enginePct, message, meta = {}) => {
            const progress = mapDownloadProgress(enginePct)
            const activity_log = setTask(
              getJob(jobId)?.activity_log,
              'download',
              'running',
              meta.detail || message
            )
            patch(jobId, { progress, message: '원본 영상을 내려받고 있어요…', activity_log })
          }
        }
      )
      sourcePath = installed.sourcePath
      await setActivity(jobId, 'download', 'done', '원본 저장 완료', {
        source_path: sourcePath,
        progress: 50,
        message: '다운로드가 끝났어요. 편집을 시작해요…'
      })
    }

    await setActivity(jobId, 'convert', 'running', '1080×1920 변환 중', {
      progress: 52,
      message: '영역을 추출하고 세로 비율로 맞추고 있어요…'
    })
    if (opts.watermark.on) {
      await setActivity(
        jobId,
        'watermark',
        'running',
        opts.watermark.kind === 'image' ? (opts.watermark.image_name || '이미지') : opts.watermark.text || 'Studio'
      )
    }
    if (opts.texts.length) {
      await setActivity(jobId, 'texts', 'running', `${opts.texts.length}개`)
    }

    const { outputPath } = await reelConvertEngine.run(
      {
        jobId,
        workspaceId: job.workspace_id,
        sourcePath,
        editOptions: opts
      },
      {
        signal: ac.signal,
        onProgress: (enginePct, message, meta = {}) => {
          let activity_log = getJob(jobId)?.activity_log || []
          activity_log = setTask(activity_log, 'convert', 'running', meta.detail || message)
          if (opts.watermark.on) {
            activity_log = setTask(
              activity_log,
              'watermark',
              'running',
              opts.watermark.kind === 'image' ? '이미지' : opts.watermark.text || 'Studio'
            )
          }
          patch(jobId, {
            progress: mapConvertProgress(enginePct),
            message: '영역을 추출하고 세로 비율로 맞추고 있어요…',
            activity_log
          })
        }
      }
    )

    await setActivity(jobId, 'convert', 'done', '9:16 변환 완료')
    if (opts.watermark.on) {
      await setActivity(jobId, 'watermark', 'done', opts.watermark.kind === 'image' ? '이미지' : opts.watermark.text)
    } else {
      await setActivity(jobId, 'watermark', 'skipped', '사용 안 함')
    }
    if (opts.texts.length) {
      await setActivity(jobId, 'texts', 'done', `${opts.texts.length}개`)
    }

    const done = await setActivity(jobId, 'save', 'done', 'output.mp4', {
      stage: 'confirm',
      output_path: outputPath,
      progress: 100,
      message: '편집이 끝났어요. 미리보기 후 게시해 주세요.',
      error: ''
    })
    return enrichJob(done)
  } catch (e) {
    if (e?.code === 'ABORTED') {
      const cancelled = getJob(jobId)
      return enrichJob(cancelled)
    }
    const cur = getJob(jobId)
    let activity_log = cur?.activity_log || []
    const runningTask = activity_log.find((t) => t.status === 'running')
    if (runningTask) {
      activity_log = setTask(activity_log, runningTask.id, 'error', e.message || String(e))
    }
    const failed = await patch(jobId, {
      stage: 'failed',
      progress: 0,
      message: '편집에 실패했어요.',
      error: e.message || String(e),
      activity_log
    })
    throw Object.assign(new Error(e.message || String(e)), { job: enrichJob(failed) })
  } finally {
    controllers.delete(jobId)
  }
}

export async function publishJob(jobId, { accountId, caption, shareToFeed } = {}) {
  if (controllers.has(jobId)) throw new Error('이미 이 작업을 처리하고 있어요.')
  const job = getJob(jobId)
  if (!job) throw new Error('작업을 찾을 수 없어요.')
  if (job.stage !== 'confirm' && job.stage !== 'failed') {
    throw new Error('편집이 끝난 뒤에만 게시할 수 있어요.')
  }
  if (!job.output_path) throw new Error('게시할 편집 영상이 없어요. 먼저 편집을 다시 실행해 주세요.')
  if (!accountId) throw new Error('업로드할 계정을 선택해 주세요.')

  const account = getAccount(accountId)
  if (!account) throw new Error('업로드할 계정을 찾을 수 없어요.')
  if (account.workspace_id !== job.workspace_id) {
    throw new Error('이 작업에 사용할 수 없는 계정이에요.')
  }
  if (!account.ig_user_id) {
    throw new Error('인스타그램 사용자 ID가 없어요. 채널 설정에서 계정을 다시 연결해 주세요.')
  }
  if (!getSecret(`meta_token:${accountId}`)) {
    throw new Error('액세스 토큰이 없어요. 채널 설정에서 토큰을 다시 저장해 주세요.')
  }

  const ac = new AbortController()
  controllers.set(jobId, ac)

  try {
    await patch(jobId, {
      stage: 'uploading',
      account_id: accountId,
      caption: caption || '',
      progress: 1,
      message: '업로드를 준비해요…',
      error: '',
      edit_options: {
        ...(job.edit_options || {}),
        share_to_feed: shareToFeed !== false
      },
      activity_log: buildUploadTasks()
    })

    const result = await igUploadEngine.run(
      {
        accountId,
        videoPath: job.output_path,
        caption: caption || '',
        shareToFeed: shareToFeed !== false
      },
      {
        signal: ac.signal,
        onProgress: (progress, message, meta = {}) => {
          let activity_log = getJob(jobId)?.activity_log || []
          if (meta.taskId) {
            activity_log = setTask(
              activity_log,
              meta.taskId,
              meta.taskStatus || 'running',
              meta.detail || message
            )
          }
          patch(jobId, { progress, message, activity_log })
        }
      }
    )

    let activity_log = getJob(jobId)?.activity_log || []
    for (const id of ['prepare', 'transfer', 'process', 'publish']) {
      activity_log = setTask(activity_log, id, 'done')
    }

    const done = await patch(jobId, {
      stage: 'done',
      container_id: result.containerId,
      published_id: result.publishedId,
      progress: 100,
      message: '릴스 게시를 완료했어요.',
      error: '',
      activity_log
    })
    updateReference(job.reference_id, { status: 'published' })
    return enrichJob(done)
  } catch (e) {
    if (e?.code === 'ABORTED') {
      const cancelled = getJob(jobId)
      return enrichJob(cancelled)
    }
    const cur = getJob(jobId)
    let activity_log = cur?.activity_log || []
    const runningTask = activity_log.find((t) => t.status === 'running')
    if (runningTask) {
      activity_log = setTask(activity_log, runningTask.id, 'error', e.message || String(e))
    }
    const failed = await patch(jobId, {
      stage: 'confirm',
      progress: 0,
      message: '게시에 실패했어요. 내용을 확인한 뒤 다시 시도해 주세요.',
      error: e.message || String(e),
      activity_log
    })
    throw Object.assign(new Error(e.message || String(e)), { job: enrichJob(failed) })
  } finally {
    controllers.delete(jobId)
  }
}

export function cancelRunningJob(jobId) {
  const ac = controllers.get(jobId)
  if (ac) {
    try {
      ac.abort()
    } catch {
      /* ignore */
    }
    controllers.delete(jobId)
  }
  const job = cancelJobDb(jobId)
  emitProgress(job)
  return enrichJob(job)
}
