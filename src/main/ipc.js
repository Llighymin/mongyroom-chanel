import { ipcMain, nativeTheme } from 'electron'
import {
  listWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace,
  listAccounts, createAccount, updateAccount, deleteAccount, getAccount,
  listReferences, createReference, updateReference, deleteReference,
  listJobs, getJob, getActiveJob, createJob, updateJob,
  listEditPresets, createEditPreset, deleteEditPreset
} from './db.js'
import { setSecret, clearSecret, hasSecret, getSecret } from './secrets.js'
import { toolsStatus } from './tools.js'
import { enrichJob, startEdit, publishJob, cancelRunningJob, prepareSource } from './pipeline/runner.js'
import { pickAndStoreImage } from './assets.js'
import { presetPayload } from '../shared/editOptions.js'
import {
  referenceCollectEngine,
  addReferenceSource,
  removeReferenceSource
} from './engines/referenceCollectEngine.js'
import {
  normalizeMetaAccountInput,
  verifyMetaUploadCredentials
} from './engines/ig/accountVerify.js'

// 전역(앱 공통) 시크릿 키 이름
const GLOBAL_KEYS = ['claude_api_key', 'youtube_api_key', 'meta_app_id', 'meta_app_secret']

export function registerIpc() {
  // ---- 워크스페이스 ----
  ipcMain.handle('workspaces:list', () => listWorkspaces())
  ipcMain.handle('workspaces:create', (_e, name) => createWorkspace(name))
  ipcMain.handle('workspaces:update', (_e, id, fields) => updateWorkspace(id, fields))
  ipcMain.handle('workspaces:delete', (_e, id) => deleteWorkspace(id))

  // ---- 메타 계정 ----
  ipcMain.handle('accounts:list', (_e, wsId) => {
    return listAccounts(wsId).map((a) => ({
      ...a,
      hasToken: hasSecret(`meta_token:${a.id}`),
      ready: !!(a.ig_user_id && hasSecret(`meta_token:${a.id}`))
    }))
  })
  ipcMain.handle('accounts:create', async (_e, wsId, data) => {
    try {
      const verified = await verifyMetaUploadCredentials(data || {})
      if (!verified.ok) {
        return { ok: false, error: verified.message }
      }
      const acc = createAccount(wsId, {
        label: (data?.label || '').trim() || (verified.username ? `@${verified.username}` : '인스타 계정'),
        ig_user_id: verified.ig_user_id,
        page_id: verified.page_id || data?.page_id || ''
      })
      setSecret(`meta_token:${acc.id}`, verified.token)
      return {
        ok: true,
        account: { ...acc, hasToken: true, ready: true },
        message: verified.message,
        permissionWarning: verified.permissionWarning || ''
      }
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
  })
  ipcMain.handle('accounts:update', async (_e, id, data) => {
    try {
      const cur = getAccount(id)
      if (!cur) return { ok: false, error: '계정을 찾을 수 없어요.' }
      const token = (data?.token || '').trim() || getSecret(`meta_token:${id}`) || ''
      const payload = {
        label: data?.label !== undefined ? data.label : cur.label,
        ig_user_id: data?.ig_user_id !== undefined ? data.ig_user_id : cur.ig_user_id,
        page_id: data?.page_id !== undefined ? data.page_id : cur.page_id,
        token
      }
      const verified = await verifyMetaUploadCredentials(payload)
      if (!verified.ok) return { ok: false, error: verified.message }
      const acc = updateAccount(id, {
        label: (payload.label || '').trim() || cur.label,
        ig_user_id: verified.ig_user_id,
        page_id: verified.page_id || payload.page_id || ''
      })
      setSecret(`meta_token:${id}`, verified.token)
      return {
        ok: true,
        account: { ...acc, hasToken: true, ready: true },
        message: verified.message,
        permissionWarning: verified.permissionWarning || ''
      }
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
  })
  ipcMain.handle('accounts:setToken', (_e, id, token) => {
    setSecret(`meta_token:${id}`, token)
    return { ok: true, hasToken: hasSecret(`meta_token:${id}`) }
  })
  ipcMain.handle('accounts:test', async (_e, payload) => {
    try {
      // 저장된 계정 테스트 또는 입력값 임시 테스트
      if (payload?.accountId) {
        const acc = getAccount(payload.accountId)
        if (!acc) return { ok: false, message: '계정을 찾을 수 없어요.' }
        const token = getSecret(`meta_token:${acc.id}`)
        const verified = await verifyMetaUploadCredentials({
          ig_user_id: acc.ig_user_id,
          page_id: acc.page_id,
          token
        })
        if (verified.ok && verified.token && verified.token !== token) {
          setSecret(`meta_token:${acc.id}`, verified.token)
        }
        if (verified.ok && verified.ig_user_id && verified.ig_user_id !== acc.ig_user_id) {
          updateAccount(acc.id, { ig_user_id: verified.ig_user_id })
        }
        return verified
      }
      return await verifyMetaUploadCredentials(payload || {})
    } catch (e) {
      return { ok: false, message: e.message || String(e) }
    }
  })
  ipcMain.handle('accounts:delete', (_e, id) => deleteAccount(id))
  // 입력값만 빠르게 형식 검사
  ipcMain.handle('accounts:validate', (_e, data) => normalizeMetaAccountInput(data || {}))

  // ---- 레퍼런스 ----
  ipcMain.handle('references:list', (_e, wsId) => listReferences(wsId))
  ipcMain.handle('references:create', (_e, wsId, data) => createReference(wsId, data || {}))
  ipcMain.handle('references:update', (_e, id, fields) => updateReference(id, fields || {}))
  ipcMain.handle('references:delete', (_e, id) => deleteReference(id))
  ipcMain.handle('references:addSource', (_e, wsId, input, platform) => {
    try {
      return { ok: true, ...addReferenceSource(wsId, input, platform) }
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
  })
  ipcMain.handle('references:removeSource', (_e, wsId, sourceId) => {
    try {
      return { ok: true, ...removeReferenceSource(wsId, sourceId) }
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
  })
  ipcMain.handle('references:collect', async (_e, wsId, sourceId, limit) => {
    try {
      const result = await referenceCollectEngine.run({
        workspaceId: wsId,
        sourceId: sourceId || null,
        limit
      })
      return { ok: true, ...result }
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
  })

  // ---- 시크릿 (전역 API 키) : 상태만 반환, 값은 반환하지 않음 ----
  ipcMain.handle('secrets:status', () => {
    const status = {}
    for (const k of GLOBAL_KEYS) status[k] = hasSecret(k)
    return status
  })
  ipcMain.handle('secrets:set', (_e, key, value) => {
    if (!GLOBAL_KEYS.includes(key)) throw new Error('허용되지 않은 키입니다.')
    setSecret(key, value)
    return { ok: true, has: hasSecret(key) }
  })
  ipcMain.handle('secrets:clear', (_e, key) => {
    if (!GLOBAL_KEYS.includes(key)) throw new Error('허용되지 않은 키입니다.')
    clearSecret(key)
    return { ok: true }
  })

  // ---- 도구 / 제작 작업 ----
  ipcMain.handle('tools:status', () => toolsStatus())

  ipcMain.handle('jobs:list', (_e, wsId) => listJobs(wsId).map(enrichJob))
  ipcMain.handle('jobs:get', (_e, id) => enrichJob(getJob(id)))
  ipcMain.handle('jobs:active', (_e, wsId) => enrichJob(getActiveJob(wsId)))
  ipcMain.handle('jobs:create', (_e, wsId, referenceId) => {
    try {
      return enrichJob(createJob(wsId, referenceId))
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })
  ipcMain.handle('jobs:update', (_e, id, fields) => enrichJob(updateJob(id, fields || {})))
  ipcMain.handle('jobs:cancel', (_e, id) => cancelRunningJob(id))
  ipcMain.handle('jobs:prepareSource', async (_e, id) => {
    try {
      return { ok: true, job: await prepareSource(id) }
    } catch (e) {
      return { ok: false, error: e.message, job: e.job || enrichJob(getJob(id)) }
    }
  })
  ipcMain.handle('jobs:startEdit', async (_e, id, editOptions) => {
    try {
      return { ok: true, job: await startEdit(id, editOptions || {}) }
    } catch (e) {
      return { ok: false, error: e.message, job: e.job || enrichJob(getJob(id)) }
    }
  })

  ipcMain.handle('presets:list', (_e, wsId) => listEditPresets(wsId))
  ipcMain.handle('presets:save', (_e, wsId, name, options) => {
    return createEditPreset(wsId, name, presetPayload(options || {}))
  })
  ipcMain.handle('presets:delete', (_e, id) => deleteEditPreset(id))
  ipcMain.handle('assets:pickWatermark', (_e, wsId) => pickAndStoreImage(wsId))
  ipcMain.handle('jobs:publish', async (_e, id, payload) => {
    try {
      return { ok: true, job: await publishJob(id, payload || {}) }
    } catch (e) {
      return { ok: false, error: e.message, job: e.job || enrichJob(getJob(id)) }
    }
  })

  // ---- 연결 테스트 ----
  ipcMain.handle('test:claude', () => testClaude())
  ipcMain.handle('test:youtube', () => testYoutube())

  // ---- 테마 ----
  ipcMain.handle('theme:get', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'))
}

async function testClaude() {
  const key = getSecret('claude_api_key')
  if (!key) return { ok: false, message: 'Claude API 키가 저장되어 있지 않습니다.' }
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    })
    if (res.ok) return { ok: true, message: 'Claude 연결 성공' }
    if (res.status === 401) return { ok: false, message: 'API 키가 올바르지 않습니다 (인증 실패).' }
    return { ok: false, message: `응답 오류 (코드 ${res.status})` }
  } catch (e) {
    return { ok: false, message: '네트워크 오류: ' + e.message }
  }
}

async function testYoutube() {
  const key = getSecret('youtube_api_key')
  if (!key) return { ok: false, message: 'YouTube API 키가 저장되어 있지 않습니다.' }
  try {
    const url = `https://www.googleapis.com/youtube/v3/i18nRegions?part=snippet&hl=ko&key=${encodeURIComponent(key)}`
    const res = await fetch(url)
    if (res.ok) return { ok: true, message: 'YouTube 연결 성공' }
    const body = await res.json().catch(() => ({}))
    const reason = body?.error?.message || `코드 ${res.status}`
    return { ok: false, message: '연결 실패: ' + reason }
  } catch (e) {
    return { ok: false, message: '네트워크 오류: ' + e.message }
  }
}