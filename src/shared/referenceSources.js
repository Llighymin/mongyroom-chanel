/** 레퍼런스 수집용 유튜브/인스타 계정 소스 */

function decodePathSegment(s) {
  try {
    return decodeURIComponent(String(s || ''))
  } catch {
    return String(s || '')
  }
}

function encodeYtHandle(handle) {
  // 한글 등 비ASCII는 퍼센트 인코딩. 이미 인코딩된 값은 이중 인코딩하지 않음.
  const h = String(handle || '').replace(/^@/, '')
  if (!h) return ''
  if (/%[0-9A-Fa-f]{2}/.test(h)) return h
  return encodeURIComponent(h)
}

function isInstagramHandle(s) {
  return /^[A-Za-z0-9._]+$/.test(s)
}

/** 유튜브 핸들/채널명: 한글·숫자·영문·._- 및 공백 허용 */
function isYoutubeHandle(s) {
  return /^[\p{L}\p{N}._\-\s]+$/u.test(s) && s.replace(/\s+/g, '').length > 0
}

export function parseReferenceSourceInput(raw, platformHint) {
  const text = String(raw || '').trim()
  if (!text) return null

  let platform = platformHint === 'instagram' || platformHint === 'youtube' ? platformHint : null
  let handle = ''
  let url = ''

  const lower = text.toLowerCase()

  if (!platform) {
    if (lower.includes('instagram.com')) platform = 'instagram'
    else if (lower.includes('youtube.com') || lower.includes('youtu.be')) platform = 'youtube'
  }

  // Instagram URL
  const igMatch = text.match(/instagram\.com\/([^/?#\s]+)/i)
  if (igMatch) {
    platform = 'instagram'
    handle = decodePathSegment(igMatch[1]).replace(/\/+$/, '')
    if (['p', 'reel', 'reels', 'tv', 'stories', 'explore'].includes(handle.toLowerCase())) {
      return null
    }
    if (!isInstagramHandle(handle)) return null
    url = `https://www.instagram.com/${handle}/`
  }

  // YouTube URL forms — 한글 핸들 포함
  const ytAt = text.match(/youtube\.com\/@([^/?#\s]+)/i)
  const ytChannel = text.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/i)
  const ytUser = text.match(/youtube\.com\/(?:user|c)\/([^/?#\s]+)/i)
  if (ytAt) {
    platform = 'youtube'
    handle = decodePathSegment(ytAt[1]).replace(/\/+$/, '')
    url = `https://www.youtube.com/@${encodeYtHandle(handle)}/videos`
  } else if (ytChannel) {
    platform = 'youtube'
    handle = ytChannel[1]
    url = `https://www.youtube.com/channel/${handle}/videos`
  } else if (ytUser) {
    platform = 'youtube'
    handle = decodePathSegment(ytUser[1]).replace(/\/+$/, '')
    url = `https://www.youtube.com/@${encodeYtHandle(handle)}/videos`
  }

  // Bare @handle / 채널명
  if (!url) {
    const bare = text.replace(/^@/, '').replace(/\/+$/, '').trim()
    if (!platform) platform = 'youtube'

    if (platform === 'instagram') {
      if (!isInstagramHandle(bare)) return null
      handle = bare
      url = `https://www.instagram.com/${handle}/`
    } else {
      if (!isYoutubeHandle(bare)) return null
      handle = bare.replace(/\s+/g, ' ').trim()
      url = `https://www.youtube.com/@${encodeYtHandle(handle.replace(/\s+/g, ''))}/videos`
      // 공백이 있는 표시명은 @핸들에서 공백 제거본을 쓰고, label은 원문 유지
      if (!handle.replace(/\s+/g, '')) return null
    }
  }

  if (!platform || !handle || !url) return null

  const idKey = handle.replace(/\s+/g, '').toLowerCase()
  return {
    id: `${platform}:${idKey}`,
    platform,
    handle,
    label: `@${handle.replace(/\s+/g, '')}`,
    url
  }
}

export function normalizeReferenceSources(raw) {
  const list = Array.isArray(raw) ? raw : []
  const out = []
  const seen = new Set()
  for (const item of list) {
    let parsed =
      item?.url || item?.handle
        ? parseReferenceSourceInput(
            item.url || (item.handle?.startsWith('@') ? item.handle : `@${item.handle}`),
            item.platform
          )
        : null

    // 예전/깨진 파서로 저장된 한글 소스도 URL이 있으면 보존
    if (!parsed && item?.url && item?.platform) {
      const h = String(item.handle || item.label || '').replace(/^@/, '') || item.url
      parsed = {
        id: item.id || `${item.platform}:${String(h).replace(/\s+/g, '').toLowerCase()}`,
        platform: item.platform,
        handle: h,
        label: item.label || `@${h}`,
        url: item.url
      }
    }

    if (!parsed) continue
    // URL에 한글이 그대로 있으면 인코딩 보정
    if (parsed.platform === 'youtube' && parsed.url.includes('/@')) {
      const m = parsed.url.match(/youtube\.com\/@([^/?#]+)/i)
      if (m && /[^\x00-\x7F]/.test(m[1])) {
        parsed = {
          ...parsed,
          url: `https://www.youtube.com/@${encodeYtHandle(decodePathSegment(m[1]))}/videos`
        }
      }
    }
    const key = parsed.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      ...parsed,
      label: item.label || parsed.label,
      added_at: item.added_at || null
    })
  }
  return out.slice(0, 30)
}
