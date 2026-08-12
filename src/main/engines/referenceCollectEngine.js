import { execFile } from 'child_process'
import { promisify } from 'util'
import { resolveTools } from '../tools.js'
import { BaseEngine } from './base.js'
import {
  listReferences,
  createReference,
  getWorkspace,
  updateWorkspace
} from '../db.js'
import { normalizeReferenceSources, parseReferenceSourceInput } from '../../shared/referenceSources.js'

const execFileAsync = promisify(execFile)
const DEFAULT_PLAYLIST_END = 100
const MIN_PLAYLIST_END = 10
const MAX_PLAYLIST_END = 500

function clampLimit(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return DEFAULT_PLAYLIST_END
  return Math.min(MAX_PLAYLIST_END, Math.max(MIN_PLAYLIST_END, Math.round(v)))
}

/**
 * 레퍼런스 계정(유튜브/인스타)에서 최근 영상을 가져와 목록에 추가한다.
 */
export class ReferenceCollectEngine extends BaseEngine {
  constructor() {
    super('레퍼런스 수집 엔진')
  }

  async execute({ workspaceId, sourceId = null, limit = DEFAULT_PLAYLIST_END }) {
    const playlistEnd = clampLimit(limit)
    const ws = getWorkspace(workspaceId)
    if (!ws) throw new Error('워크스페이스를 찾을 수 없어요.')

    const sources = normalizeReferenceSources(ws.reference_sources || [])
    const targets = sourceId ? sources.filter((s) => s.id === sourceId) : sources
    if (!targets.length) {
      throw new Error('먼저 채널 설정에서 유튜브·인스타 계정을 추가해 주세요.')
    }

    const { ytdlp } = resolveTools()
    if (!ytdlp) {
      throw new Error('yt-dlp가 설치되어 있지 않아요. brew install yt-dlp 후 다시 시도해 주세요.')
    }

    const existing = listReferences(workspaceId)
    const existingUrls = new Set(
      existing.map((r) => normalizeUrlKey(r.url)).filter(Boolean)
    )

    let added = 0
    let scanned = 0
    const errors = []

    for (let i = 0; i < targets.length; i++) {
      const src = targets[i]
      this.progress(
        Math.round(((i + 0.2) / targets.length) * 90),
        `${src.label} 영상을 불러오는 중이에요…`,
        { detail: `최근 ${playlistEnd}개` }
      )

      try {
        const entries = await fetchPlaylist(ytdlp, src, playlistEnd)
        scanned += entries.length
        for (const entry of entries) {
          const url = entry.url
          const key = normalizeUrlKey(url)
          if (!key || existingUrls.has(key)) continue
          createReference(workspaceId, {
            title: entry.title || '제목 없음',
            url,
            source: src.platform,
            thumbnail_url: entry.thumbnail || '',
            author: entry.uploader || src.label,
            keyword: src.handle,
            source_account: src.id,
            notes: '',
            status: 'new'
          })
          existingUrls.add(key)
          added += 1
        }
      } catch (e) {
        errors.push(`${src.label}: ${e.message || String(e)}`)
      }
    }

    this.progress(100, '수집이 끝났어요.', { detail: `추가 ${added}개` })
    return {
      added,
      scanned,
      sourceCount: targets.length,
      limit: playlistEnd,
      errors
    }
  }
}

async function fetchPlaylist(ytdlp, src, playlistEnd = DEFAULT_PLAYLIST_END) {
  const candidates = buildListUrls(src)
  let lastError = ''

  for (const listUrl of candidates) {
    let stdout = ''
    try {
      const res = await execFileAsync(
        ytdlp,
        [
          '--flat-playlist',
          '--playlist-end', String(playlistEnd),
          '--skip-download',
          '-J',
          listUrl
        ],
        {
          timeout: Math.min(300000, 60000 + playlistEnd * 800),
          maxBuffer: 40 * 1024 * 1024,
          env: { ...process.env, PYTHONWARNINGS: 'ignore' }
        }
      )
      stdout = res.stdout || ''
    } catch (e) {
      lastError = (e?.stderr || e?.message || String(e)).toString()
      if (!stdout) continue
    }

    let data
    try {
      data = JSON.parse(stdout)
    } catch {
      lastError = '영상 목록을 해석하지 못했어요.'
      continue
    }

    const entries = Array.isArray(data?.entries)
      ? data.entries
      : data?.id
        ? [data]
        : []

    const mapped = entries
      .filter(Boolean)
      .map((e) => mapEntry(e, src))
      .filter((e) => e.url)

    if (mapped.length) return mapped

    // 채널 메타만 있고 entries가 비어 있으면 다음 후보
    if (data?.channel_id || data?.uploader_id || data?.id) {
      lastError = '이 계정에서 가져올 영상이 없어요.'
    }
  }

  throw new Error(shortErr(lastError) || '계정 영상을 불러오지 못했어요. 채널 주소나 핸들을 확인해 주세요.')
}

function buildListUrls(src) {
  if (src.platform !== 'youtube') return [src.url]

  const handle = String(src.handle || '').replace(/^@/, '').replace(/\s+/g, '').trim()
  const urls = []
  const push = (u) => {
    if (u && !urls.includes(u)) urls.push(u)
  }

  const base = String(src.url || '').replace(/\/+$/, '')
  if (base) {
    push(base.includes('/videos') ? base : `${base}/videos`)
    push(base.replace(/\/videos$/, ''))
  }

  if (handle) {
    // 한글 핸들: 인코딩본·원문 모두 시도 (환경에 따라 둘 중 하나만 동작)
    const enc = encodeURIComponent(handle)
    push(`https://www.youtube.com/@${enc}/videos`)
    push(`https://www.youtube.com/@${handle}/videos`)
  }

  return urls
}

function mapEntry(e, src) {
  const id = e.id || e.url || ''
  let url = e.url || e.webpage_url || ''
  if (url && !/^https?:\/\//i.test(url)) {
    if (src.platform === 'youtube') {
      url = `https://www.youtube.com/watch?v=${id}`
    } else if (src.platform === 'instagram') {
      url = `https://www.instagram.com/reel/${id}/`
    }
  }
  if (!url && src.platform === 'youtube' && id) {
    url = `https://www.youtube.com/watch?v=${id}`
  }
  if (!url && src.platform === 'instagram' && id) {
    url = `https://www.instagram.com/p/${id}/`
  }

  const thumb =
    e.thumbnail ||
    (Array.isArray(e.thumbnails) && e.thumbnails.length
      ? e.thumbnails[e.thumbnails.length - 1].url
      : '') ||
    (src.platform === 'youtube' && id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '')

  return {
    title: String(e.title || e.fulltitle || '제목 없음').slice(0, 200),
    url,
    thumbnail: thumb || '',
    uploader: e.uploader || e.channel || e.creator || src.label
  }
}

function normalizeUrlKey(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu')) {
      const v = u.searchParams.get('v')
      if (v) return `yt:${v}`
      const m = u.pathname.match(/\/(shorts|live|embed)\/([^/?#]+)/)
      if (m) return `yt:${m[2]}`
      if (u.hostname === 'youtu.be') return `yt:${u.pathname.replace(/^\//, '')}`
    }
    if (u.hostname.includes('instagram.com')) {
      const m = u.pathname.match(/\/(p|reel|reels|tv)\/([^/?#]+)/)
      if (m) return `ig:${m[2]}`
    }
    return `${u.hostname}${u.pathname}`.replace(/\/+$/, '').toLowerCase()
  } catch {
    return String(url).trim().toLowerCase()
  }
}

function shortErr(msg) {
  const line = String(msg)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(-3)
    .join(' ')
  return line.slice(0, 180)
}

export const referenceCollectEngine = new ReferenceCollectEngine()

/** 워크스페이스에 소스 계정 추가 */
export function addReferenceSource(workspaceId, input, platformHint) {
  const ws = getWorkspace(workspaceId)
  if (!ws) throw new Error('워크스페이스를 찾을 수 없어요.')
  const parsed = parseReferenceSourceInput(input, platformHint)
  if (!parsed) throw new Error('유튜브 또는 인스타 계정 주소를 확인해 주세요.')
  const sources = normalizeReferenceSources(ws.reference_sources || [])
  if (sources.some((s) => s.id === parsed.id)) {
    return { sources, added: null, already: true }
  }
  const next = [
    { ...parsed, added_at: new Date().toISOString() },
    ...sources
  ]
  const updated = updateWorkspace(workspaceId, { reference_sources: next })
  return { sources: updated.reference_sources, added: parsed, already: false, workspace: updated }
}

export function removeReferenceSource(workspaceId, sourceId) {
  const ws = getWorkspace(workspaceId)
  if (!ws) throw new Error('워크스페이스를 찾을 수 없어요.')
  const next = normalizeReferenceSources(ws.reference_sources || []).filter((s) => s.id !== sourceId)
  const updated = updateWorkspace(workspaceId, { reference_sources: next })
  return { sources: updated.reference_sources, workspace: updated }
}
