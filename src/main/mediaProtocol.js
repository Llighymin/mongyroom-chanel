import { protocol, app } from 'electron'
import { createReadStream, existsSync, statSync } from 'fs'
import { basename, join, normalize, relative, extname } from 'path'
import { Readable } from 'stream'
import { assetsRoot } from './assets.js'

const SCHEME = 'studio-media'

export function jobsRoot() {
  return join(app.getPath('userData'), 'jobs')
}

export function jobDir(jobId) {
  return join(jobsRoot(), String(jobId))
}

/** 미리보기용 커스텀 프로토콜 — userData/jobs 아래 파일만 허용 */
export function registerMediaProtocol() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
        corsEnabled: true
      }
    }
  ])
}

function mimeFor(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.m4v') return 'video/x-m4v'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

/**
 * studio-media://job/{id}/output.mp4
 * studio-media://localhost/job/{id}/output.mp4
 * 등 변형을 jobs 루트 상대 경로로 해석
 */
export function resolveMediaRequestUrl(requestUrl) {
  let u
  try {
    u = new URL(requestUrl)
  } catch {
    return null
  }

  const parts = []
  const host = (u.hostname || '').toLowerCase()
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    parts.push(host)
  }

  const pathParts = decodeURIComponent(u.pathname || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
  parts.push(...pathParts)

  // studio-media://asset/{wsId}/file.png
  if (parts[0] === 'asset') {
    parts.shift()
    if (parts.length < 2) return null
    const wsId = parts[0]
    const file = basename(parts.slice(1).join('/'))
    const root = normalize(assetsRoot(wsId))
    const filePath = normalize(join(root, file))
    const rel = relative(root, filePath)
    if (!rel || rel.startsWith('..') || rel.includes('..')) return null
    return filePath
  }

  // studio-media://job/12/output.mp4 → ['job','12','output.mp4']
  if (parts[0] === 'job') parts.shift()
  if (parts.length < 2) return null

  const filePath = normalize(join(jobsRoot(), ...parts))
  const root = normalize(jobsRoot())
  const rel = relative(root, filePath)
  if (!rel || rel.startsWith('..') || rel.includes('..')) return null
  return filePath
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null
  const spec = rangeHeader.slice('bytes='.length).split(',')[0]?.trim()
  if (!spec) return null
  const [startStr, endStr] = spec.split('-')
  let start = startStr === '' ? NaN : Number(startStr)
  let end = endStr === '' ? NaN : Number(endStr)
  if (Number.isNaN(start)) {
    // suffix: bytes=-500
    const suffix = Number(endStr)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    if (!Number.isFinite(start) || start < 0) return null
    end = Number.isFinite(end) ? end : size - 1
  }
  if (start >= size) return null
  end = Math.min(end, size - 1)
  if (end < start) return null
  return { start, end }
}

function streamResponse(filePath, start, end) {
  const nodeStream = createReadStream(filePath, { start, end })
  // Node Readable → Web ReadableStream (Chromium <video> Range 재생에 필요)
  return Readable.toWeb(nodeStream)
}

export function attachMediaProtocolHandler() {
  protocol.handle(SCHEME, async (request) => {
    try {
      const filePath = resolveMediaRequestUrl(request.url)
      if (!filePath || !existsSync(filePath)) {
        return new Response('Not found', { status: 404 })
      }

      const { size } = statSync(filePath)
      const mime = mimeFor(filePath)
      const rangeHeader =
        request.headers?.get?.('Range') ||
        request.headers?.get?.('range') ||
        null
      const range = parseRange(rangeHeader, size)

      if (range) {
        const { start, end } = range
        const chunkSize = end - start + 1
        return new Response(streamResponse(filePath, start, end), {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache'
          }
        })
      }

      return new Response(streamResponse(filePath, 0, size - 1), {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        }
      })
    } catch (e) {
      return new Response(String(e?.message || 'Error'), { status: 500 })
    }
  })
}

export function mediaUrlFor(jobId, filename, cacheKey) {
  const base = `${SCHEME}://job/${jobId}/${filename}`
  if (cacheKey == null || cacheKey === '') return base
  return `${base}?v=${encodeURIComponent(String(cacheKey))}`
}

/** 미리보기 파일이 실제로 있는지 */
export function previewFileExists(jobId, filename = 'output.mp4') {
  return existsSync(join(jobDir(jobId), filename))
}

export function previewFileMtime(jobId, filename = 'output.mp4') {
  const p = join(jobDir(jobId), filename)
  if (!existsSync(p)) return null
  try {
    return String(statSync(p).mtimeMs)
  } catch {
    return null
  }
}
