import { app } from 'electron'
import { join, basename } from 'path'
import { existsSync, statSync } from 'fs'
import Database from 'better-sqlite3'
import { defaultEditOptions, normalizeEditOptions } from '../shared/editOptions.js'
import { normalizeReferenceSources } from '../shared/referenceSources.js'
import { assetUrlFor, resolveWatermarkImagePath, overlayPreviewMap } from './assets.js'

let db

/** 앱 데이터 폴더에 SQLite 파일을 열고 스키마를 준비한다. */
export function initDb() {
  const file = join(app.getPath('userData'), 'studio.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      keywords    TEXT NOT NULL DEFAULT '[]',
      interval_minutes INTEGER NOT NULL DEFAULT 60,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meta_accounts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      label        TEXT NOT NULL,
      ig_user_id   TEXT NOT NULL DEFAULT '',
      page_id      TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS secrets (
      key       TEXT PRIMARY KEY,
      enc_value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reference_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      url           TEXT NOT NULL DEFAULT '',
      source        TEXT NOT NULL DEFAULT 'manual',
      thumbnail_url TEXT NOT NULL DEFAULT '',
      author        TEXT NOT NULL DEFAULT '',
      keyword       TEXT NOT NULL DEFAULT '',
      score         REAL,
      notes         TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'new',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id   INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      reference_id   INTEGER NOT NULL REFERENCES reference_items(id) ON DELETE CASCADE,
      account_id     INTEGER,
      stage          TEXT NOT NULL DEFAULT 'select',
      edit_options   TEXT NOT NULL DEFAULT '{}',
      caption        TEXT NOT NULL DEFAULT '',
      progress       INTEGER NOT NULL DEFAULT 0,
      message        TEXT NOT NULL DEFAULT '',
      source_path    TEXT NOT NULL DEFAULT '',
      output_path    TEXT NOT NULL DEFAULT '',
      container_id   TEXT NOT NULL DEFAULT '',
      published_id   TEXT NOT NULL DEFAULT '',
      error          TEXT NOT NULL DEFAULT '',
      activity_log   TEXT NOT NULL DEFAULT '[]',
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  ensureColumn('jobs', 'activity_log', "TEXT NOT NULL DEFAULT '[]'")
  ensureColumn('workspaces', 'default_edit_options', "TEXT NOT NULL DEFAULT '{}'")
  ensureColumn('workspaces', 'reference_sources', "TEXT NOT NULL DEFAULT '[]'")
  ensureColumn('reference_items', 'source_account', "TEXT NOT NULL DEFAULT ''")

  db.exec(`
    CREATE TABLE IF NOT EXISTS edit_presets (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      options      TEXT NOT NULL DEFAULT '{}',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  ensureWorkspaceDefaultEditOptions()
  return db
}

/** 모든 워크스페이스 기본 편집값에 전체화면 크롭을 포함한 정규화 옵션을 넣는다. */
function ensureWorkspaceDefaultEditOptions() {
  const rows = db.prepare('SELECT id, name, default_edit_options FROM workspaces').all()
  const update = db.prepare('UPDATE workspaces SET default_edit_options=? WHERE id=?')
  for (const r of rows) {
    const raw = safeParseObject(r.default_edit_options)
    const normalized = normalizeEditOptions(raw, r.name)
    // 빈 기본값이거나 crop가 없으면 전체화면으로 고정
    if (!raw || !Object.keys(raw).length || !raw.crop) {
      normalized.crop = { x: 0, y: 0, w: 1, h: 1 }
    }
    update.run(JSON.stringify(normalized), r.id)
  }
}

function ensureColumn(table, column, typeDef) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`)
  }
}

export function getDb() {
  if (!db) throw new Error('DB가 아직 초기화되지 않았습니다.')
  return db
}

// ---- 워크스페이스 ----
export function listWorkspaces() {
  const rows = getDb().prepare('SELECT * FROM workspaces ORDER BY id ASC').all()
  return rows.map(mapWorkspace)
}

export function createWorkspace(name) {
  const wsName = name || '새 워크스페이스'
  const defaults = normalizeEditOptions(defaultEditOptions(wsName), wsName)
  defaults.crop = { x: 0, y: 0, w: 1, h: 1 }
  const info = getDb()
    .prepare('INSERT INTO workspaces (name, default_edit_options) VALUES (?, ?)')
    .run(wsName, JSON.stringify(defaults))
  return getWorkspace(info.lastInsertRowid)
}

export function getWorkspace(id) {
  const r = getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(id)
  return r ? mapWorkspace(r) : null
}

function mapWorkspace(r) {
  const name = r.name || 'Studio'
  const raw = safeParseObject(r.default_edit_options)
  const default_edit_options = normalizeEditOptions(raw, name)
  let watermark_preview_url = null
  const wm = default_edit_options.watermark
  if (wm?.kind === 'image') {
    const resolved = resolveWatermarkImagePath(r.id, wm)
    if (resolved && existsSync(resolved)) {
      default_edit_options.watermark.image_path = resolved
      default_edit_options.watermark.image_file = basename(resolved)
      try {
        watermark_preview_url = assetUrlFor(r.id, basename(resolved), String(statSync(resolved).mtimeMs))
      } catch {
        watermark_preview_url = assetUrlFor(r.id, basename(resolved))
      }
    }
  }
  return {
    ...r,
    keywords: safeParse(r.keywords),
    reference_sources: normalizeReferenceSources(safeParse(r.reference_sources)),
    default_edit_options,
    watermark_preview_url,
    overlay_preview_urls: overlayPreviewMap(r.id, default_edit_options.images)
  }
}

export function updateWorkspace(id, fields) {
  const cur = getWorkspace(id)
  if (!cur) return null
  const name = fields.name ?? cur.name
  const keywords = JSON.stringify(fields.keywords ?? cur.keywords)
  const interval = Number(fields.interval_minutes ?? cur.interval_minutes)
  const editRaw =
    fields.default_edit_options !== undefined
      ? fields.default_edit_options
      : (cur.default_edit_options || {})
  const defaultEdit = JSON.stringify(normalizeEditOptions(editRaw, name))
  const sources = JSON.stringify(
    normalizeReferenceSources(
      fields.reference_sources !== undefined
        ? fields.reference_sources
        : (cur.reference_sources || [])
    )
  )
  getDb()
    .prepare(
      'UPDATE workspaces SET name=?, keywords=?, interval_minutes=?, default_edit_options=?, reference_sources=? WHERE id=?'
    )
    .run(name, keywords, interval, defaultEdit, sources, id)
  return getWorkspace(id)
}

export function deleteWorkspace(id) {
  // 이 워크스페이스에 속한 계정 토큰 시크릿도 함께 정리
  const accounts = listAccounts(id)
  for (const a of accounts) deleteSecretRow(`meta_token:${a.id}`)
  getDb().prepare('DELETE FROM workspaces WHERE id=?').run(id)
  return true
}

// ---- 메타 계정 ----
export function listAccounts(workspaceId) {
  return getDb()
    .prepare('SELECT * FROM meta_accounts WHERE workspace_id=? ORDER BY id ASC')
    .all(workspaceId)
}

export function createAccount(workspaceId, data) {
  const info = getDb()
    .prepare(
      'INSERT INTO meta_accounts (workspace_id, label, ig_user_id, page_id) VALUES (?,?,?,?)'
    )
    .run(workspaceId, data.label || '새 계정', data.ig_user_id || '', data.page_id || '')
  return getDb().prepare('SELECT * FROM meta_accounts WHERE id=?').get(info.lastInsertRowid)
}

export function updateAccount(id, fields = {}) {
  const cur = getAccount(id)
  if (!cur) return null
  getDb()
    .prepare(
      'UPDATE meta_accounts SET label=?, ig_user_id=?, page_id=? WHERE id=?'
    )
    .run(
      fields.label !== undefined ? fields.label : cur.label,
      fields.ig_user_id !== undefined ? fields.ig_user_id : cur.ig_user_id,
      fields.page_id !== undefined ? fields.page_id : cur.page_id,
      id
    )
  return getAccount(id)
}

export function deleteAccount(id) {
  deleteSecretRow(`meta_token:${id}`)
  getDb().prepare('DELETE FROM meta_accounts WHERE id=?').run(id)
  return true
}

export function getAccount(id) {
  return getDb().prepare('SELECT * FROM meta_accounts WHERE id=?').get(id) || null
}

// ---- 레퍼런스 ----
export function listReferences(workspaceId) {
  return getDb()
    .prepare('SELECT * FROM reference_items WHERE workspace_id=? ORDER BY id DESC')
    .all(workspaceId)
}

export function getReference(id) {
  return getDb().prepare('SELECT * FROM reference_items WHERE id=?').get(id) || null
}

export function createReference(workspaceId, data) {
  const info = getDb()
    .prepare(
      `INSERT INTO reference_items
        (workspace_id, title, url, source, thumbnail_url, author, keyword, score, notes, status, source_account)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      workspaceId,
      data.title || '제목 없음',
      data.url || '',
      data.source || 'manual',
      data.thumbnail_url || '',
      data.author || '',
      data.keyword || '',
      data.score ?? null,
      data.notes || '',
      data.status || 'new',
      data.source_account || ''
    )
  return getDb().prepare('SELECT * FROM reference_items WHERE id=?').get(info.lastInsertRowid)
}

export function updateReference(id, fields) {
  const cur = getDb().prepare('SELECT * FROM reference_items WHERE id=?').get(id)
  if (!cur) return null
  getDb()
    .prepare(
      `UPDATE reference_items SET
        title=?, url=?, source=?, thumbnail_url=?, author=?, keyword=?, score=?, notes=?, status=?, source_account=?
       WHERE id=?`
    )
    .run(
      fields.title ?? cur.title,
      fields.url ?? cur.url,
      fields.source ?? cur.source,
      fields.thumbnail_url ?? cur.thumbnail_url,
      fields.author ?? cur.author,
      fields.keyword ?? cur.keyword,
      fields.score !== undefined ? fields.score : cur.score,
      fields.notes ?? cur.notes,
      fields.status ?? cur.status,
      fields.source_account ?? cur.source_account ?? '',
      id
    )
  return getDb().prepare('SELECT * FROM reference_items WHERE id=?').get(id)
}

export function deleteReference(id) {
  getDb().prepare('DELETE FROM reference_items WHERE id=?').run(id)
  return true
}

// ---- 제작 작업(jobs) ----
const ACTIVE_STAGES = ['select', 'edit', 'confirm', 'uploading', 'failed']

function mapJob(row) {
  if (!row) return null
  return {
    ...row,
    edit_options: safeParseObject(row.edit_options),
    activity_log: safeParseArray(row.activity_log)
  }
}

export function listJobs(workspaceId) {
  return getDb()
    .prepare('SELECT * FROM jobs WHERE workspace_id=? ORDER BY id DESC')
    .all(workspaceId)
    .map(mapJob)
}

export function getJob(id) {
  return mapJob(getDb().prepare('SELECT * FROM jobs WHERE id=?').get(id))
}

export function getActiveJob(workspaceId) {
  const placeholders = ACTIVE_STAGES.map(() => '?').join(',')
  const row = getDb()
    .prepare(
      `SELECT * FROM jobs WHERE workspace_id=? AND stage IN (${placeholders}) ORDER BY id DESC LIMIT 1`
    )
    .get(workspaceId, ...ACTIVE_STAGES)
  return mapJob(row)
}

export function createJob(workspaceId, referenceId) {
  const active = getActiveJob(workspaceId)
  if (active) {
    const err = new Error('이미 진행 중인 제작이 있어요. 먼저 마무리하거나 취소해 주세요.')
    err.code = 'JOB_ACTIVE'
    throw err
  }
  const ref = getReference(referenceId)
  if (!ref || ref.workspace_id !== workspaceId) {
    throw new Error('레퍼런스를 찾을 수 없습니다.')
  }
  const info = getDb()
    .prepare(
      `INSERT INTO jobs (workspace_id, reference_id, stage, message)
       VALUES (?,?,?,?)`
    )
    .run(workspaceId, referenceId, 'select', '레퍼런스를 확인한 뒤 편집으로 넘어가세요.')
  updateReference(referenceId, { status: 'in_pipeline' })
  return getJob(info.lastInsertRowid)
}

export function updateJob(id, fields) {
  const cur = getJob(id)
  if (!cur) return null
  const next = {
    account_id: fields.account_id !== undefined ? fields.account_id : cur.account_id,
    stage: fields.stage ?? cur.stage,
    edit_options: JSON.stringify(fields.edit_options ?? cur.edit_options ?? {}),
    caption: fields.caption ?? cur.caption,
    progress: fields.progress !== undefined ? fields.progress : cur.progress,
    message: fields.message ?? cur.message,
    source_path: fields.source_path ?? cur.source_path,
    output_path: fields.output_path ?? cur.output_path,
    container_id: fields.container_id ?? cur.container_id,
    published_id: fields.published_id ?? cur.published_id,
    error: fields.error !== undefined ? fields.error : cur.error,
    activity_log: JSON.stringify(
      fields.activity_log !== undefined ? fields.activity_log : (cur.activity_log || [])
    )
  }
  getDb()
    .prepare(
      `UPDATE jobs SET
        account_id=?, stage=?, edit_options=?, caption=?, progress=?, message=?,
        source_path=?, output_path=?, container_id=?, published_id=?, error=?,
        activity_log=?, updated_at=datetime('now')
       WHERE id=?`
    )
    .run(
      next.account_id,
      next.stage,
      next.edit_options,
      next.caption,
      next.progress,
      next.message,
      next.source_path,
      next.output_path,
      next.container_id,
      next.published_id,
      next.error,
      next.activity_log,
      id
    )
  return getJob(id)
}

export function listEditPresets(workspaceId) {
  return getDb()
    .prepare('SELECT * FROM edit_presets WHERE workspace_id=? ORDER BY updated_at DESC, id DESC')
    .all(workspaceId)
    .map(mapPreset)
}

export function createEditPreset(workspaceId, name, options) {
  const info = getDb()
    .prepare('INSERT INTO edit_presets (workspace_id, name, options) VALUES (?,?,?)')
    .run(workspaceId, String(name || '새 프리셋').slice(0, 40), JSON.stringify(options || {}))
  return getEditPreset(info.lastInsertRowid)
}

export function getEditPreset(id) {
  return mapPreset(getDb().prepare('SELECT * FROM edit_presets WHERE id=?').get(id))
}

export function updateEditPreset(id, fields) {
  const cur = getEditPreset(id)
  if (!cur) return null
  getDb()
    .prepare(
      `UPDATE edit_presets SET name=?, options=?, updated_at=datetime('now') WHERE id=?`
    )
    .run(
      fields.name ?? cur.name,
      JSON.stringify(fields.options ?? cur.options ?? {}),
      id
    )
  return getEditPreset(id)
}

export function deleteEditPreset(id) {
  getDb().prepare('DELETE FROM edit_presets WHERE id=?').run(id)
  return true
}

function mapPreset(row) {
  if (!row) return null
  return { ...row, options: safeParseObject(row.options) }
}

export function cancelJob(id) {
  const job = getJob(id)
  if (!job) return null
  if (job.stage === 'done') return job
  updateJob(id, {
    stage: 'cancelled',
    progress: 0,
    message: '작업을 취소했어요.',
    error: 'cancelled'
  })
  if (job.reference_id) updateReference(job.reference_id, { status: 'new' })
  return getJob(id)
}

// ---- 시크릿 (암호화된 값 저장, 평문은 절대 밖으로 내보내지 않음) ----
export function upsertSecretRow(key, encValue) {
  getDb()
    .prepare(
      'INSERT INTO secrets (key, enc_value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET enc_value=excluded.enc_value'
    )
    .run(key, encValue)
}

export function getSecretRow(key) {
  const r = getDb().prepare('SELECT enc_value FROM secrets WHERE key=?').get(key)
  return r ? r.enc_value : null
}

export function deleteSecretRow(key) {
  getDb().prepare('DELETE FROM secrets WHERE key=?').run(key)
}

export function listSecretKeys() {
  return getDb().prepare('SELECT key FROM secrets').all().map((r) => r.key)
}

function safeParse(s) {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function safeParseObject(s) {
  try {
    const v = typeof s === 'string' ? JSON.parse(s) : s
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

function safeParseArray(s) {
  try {
    const v = typeof s === 'string' ? JSON.parse(s) : s
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
