/** 릴스 캔버스 */
export const REEL_W = 1080
export const REEL_H = 1920

export const FILL_PRESETS = [
  { id: 'black', label: '검정', value: '#000000' },
  { id: 'white', label: '흰색', value: '#FFFFFF' },
  { id: 'dark', label: '다크 그레이', value: '#1A1A1A' },
  { id: 'cream', label: '크림', value: '#F4EFE6' }
]

export const FONT_OPTIONS = [
  { id: 'apple-sd', label: '애플 SD 고딕', css: '"Apple SD Gothic Neo", "AppleGothic", sans-serif', mac: 'Apple SD Gothic Neo' },
  { id: 'system', label: '시스템', css: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif', mac: null },
  { id: 'helvetica', label: 'Helvetica', css: '"Helvetica Neue", Helvetica, sans-serif', mac: 'Helvetica Neue' },
  { id: 'arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif', mac: 'Arial' },
  { id: 'georgia', label: 'Georgia', css: 'Georgia, "Times New Roman", serif', mac: 'Georgia' },
  { id: 'menlo', label: 'Menlo', css: 'Menlo, Monaco, monospace', mac: 'Menlo' },
  { id: 'impact', label: 'Impact', css: 'Impact, Haettenschweiler, sans-serif', mac: 'Impact' }
]

export const WEIGHT_OPTIONS = [
  { id: 'regular', label: '보통', css: 400 },
  { id: 'medium', label: '중간', css: 500 },
  { id: 'semibold', label: '세미볼드', css: 600 },
  { id: 'bold', label: '굵게', css: 700 }
]

export function fontCss(id) {
  return FONT_OPTIONS.find((f) => f.id === id)?.css || FONT_OPTIONS[0].css
}

export function weightCss(id) {
  return WEIGHT_OPTIONS.find((w) => w.id === id)?.css || 600
}

export function fontMac(id) {
  return FONT_OPTIONS.find((f) => f.id === id)?.mac || null
}

export const WATERMARK_POSITIONS = [
  { id: 'top-left', label: '왼쪽 위', px: 0.04, py: 0.04 },
  { id: 'top-center', label: '가운데 위', px: 0.5, py: 0.04 },
  { id: 'top-right', label: '오른쪽 위', px: 0.96, py: 0.04 },
  { id: 'center', label: '정중앙', px: 0.5, py: 0.5 },
  { id: 'bottom-left', label: '왼쪽 아래', px: 0.04, py: 0.92 },
  { id: 'bottom-center', label: '가운데 아래', px: 0.5, py: 0.92 },
  { id: 'bottom-right', label: '오른쪽 아래', px: 0.96, py: 0.92 },
  { id: 'custom', label: '직접 지정', px: 0.5, py: 0.92 }
]

export function defaultEditOptions(workspaceName = 'Studio') {
  return {
    share_to_feed: true,
    fill_color: '#000000',
    crop: { x: 0, y: 0, w: 1, h: 1 },
    watermark: {
      on: true,
      kind: 'text',
      text: workspaceName || 'Studio',
      image_path: '',
      image_name: '',
      image_file: '',
      position: 'bottom-center',
      px: 0.5,
      py: 0.92,
      scale: 0.22,
      size: 36,
      font: 'apple-sd',
      align: 'center',
      color: '#FFFFFF',
      weight: 'semibold',
      shadow: true,
      stroke: true
    },
    texts: []
  }
}

function clamp01(n, fallback = 0) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(1, Math.max(0, v))
}

function clampCrop(crop = {}) {
  let x = clamp01(crop.x, 0)
  let y = clamp01(crop.y, 0)
  let w = clamp01(crop.w, 1)
  let h = clamp01(crop.h, 1)
  if (w < 0.02) w = 0.02
  if (h < 0.02) h = 0.02
  if (x + w > 1) w = Math.max(0.02, 1 - x)
  if (y + h > 1) h = Math.max(0.02, 1 - y)
  return { x, y, w, h }
}

function hexColor(v, fallback = '#000000') {
  const s = String(v || '').trim()
  if (/^#([0-9a-fA-F]{6})$/.test(s)) return s.toUpperCase()
  if (/^#([0-9a-fA-F]{3})$/.test(s)) {
    const r = s[1], g = s[2], b = s[3]
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return fallback
}

function basenamePath(p) {
  const s = String(p || '')
  const parts = s.split(/[/\\]/)
  return parts[parts.length - 1] || ''
}

export function normalizeEditOptions(raw = {}, workspaceName = 'Studio') {
  const base = defaultEditOptions(workspaceName)
  const wmIn = raw.watermark && typeof raw.watermark === 'object' ? raw.watermark : {}
  const legacyOn = raw.watermark_on !== undefined ? !!raw.watermark_on : wmIn.on
  const pos =
    WATERMARK_POSITIONS.find((p) => p.id === wmIn.position) ||
    WATERMARK_POSITIONS.find((p) => p.id === 'bottom-center')

  const imagePath = String(wmIn.image_path || '')
  const imageFile = basenamePath(wmIn.image_file) || basenamePath(imagePath)

  const watermark = {
    on: legacyOn !== undefined ? !!legacyOn : base.watermark.on,
    kind: wmIn.kind === 'image' ? 'image' : 'text',
    text: String(wmIn.text || raw.watermark_text || base.watermark.text).slice(0, 80),
    image_path: imagePath,
    image_name: String(wmIn.image_name || ''),
    image_file: imageFile,
    position: pos.id,
    px: clamp01(wmIn.px, pos.px),
    py: clamp01(wmIn.py, pos.py),
    scale: Math.min(0.8, Math.max(0.06, Number(wmIn.scale) || base.watermark.scale)),
    size: Math.min(96, Math.max(16, Number(wmIn.size) || base.watermark.size)),
    font: FONT_OPTIONS.some((f) => f.id === wmIn.font) ? wmIn.font : base.watermark.font,
    align: 'center',
    color: hexColor(wmIn.color, base.watermark.color),
    weight: WEIGHT_OPTIONS.some((w) => w.id === wmIn.weight) ? wmIn.weight : base.watermark.weight,
    shadow: wmIn.shadow !== false,
    stroke: wmIn.stroke !== false
  }

  if (watermark.position !== 'custom') {
    watermark.px = pos.px
    watermark.py = pos.py
  }

  const texts = Array.isArray(raw.texts)
    ? raw.texts
        .map((t, i) => ({
          id: String(t?.id || `t${i + 1}`),
          text: String(t?.text || '').slice(0, 120),
          x: clamp01(t?.x, 0.5),
          y: clamp01(t?.y, 0.12 + i * 0.08),
          size: Math.min(96, Math.max(16, Number(t?.size) || 36)),
          color: hexColor(t?.color, '#FFFFFF'),
          font: FONT_OPTIONS.some((f) => f.id === t?.font) ? t.font : 'apple-sd',
          align: 'center',
          weight: WEIGHT_OPTIONS.some((w) => w.id === t?.weight) ? t.weight : 'semibold',
          shadow: t?.shadow !== false,
          stroke: t?.stroke !== false
        }))
        .filter((t) => t.text.trim())
        .slice(0, 8)
    : []

  return {
    share_to_feed: raw.share_to_feed !== false,
    fill_color: hexColor(raw.fill_color, base.fill_color),
    crop: clampCrop(raw.crop || base.crop),
    watermark,
    texts
  }
}

/** 프리셋으로 저장할 때 영상별 정보는 뺀다 */
export function presetPayload(opts) {
  const n = normalizeEditOptions(opts)
  return {
    fill_color: n.fill_color,
    crop: n.crop,
    watermark: { ...n.watermark },
    texts: n.texts,
    share_to_feed: n.share_to_feed
  }
}

/**
 * 채널(워크스페이스) 기본 편집값을 기준으로 job/화면 옵션을 합친다.
 * 이미지 워터마크 경로가 비어 있으면 채널 기본 이미지를 채운다.
 */
export function resolveEditOptions(raw = {}, workspace = {}) {
  const name = workspace?.name || 'Studio'
  const channelDefaults = normalizeEditOptions(workspace?.default_edit_options || {}, name)
  const rawObj = raw && typeof raw === 'object' ? raw : {}
  const hasRaw = Object.keys(rawObj).length > 0

  if (!hasRaw) return channelDefaults

  const rawWm = rawObj.watermark && typeof rawObj.watermark === 'object' ? rawObj.watermark : null
  const merged = normalizeEditOptions(
    {
      ...channelDefaults,
      ...rawObj,
      crop: rawObj.crop || channelDefaults.crop,
      fill_color: rawObj.fill_color ?? channelDefaults.fill_color,
      share_to_feed: rawObj.share_to_feed ?? channelDefaults.share_to_feed,
      texts: Array.isArray(rawObj.texts) ? rawObj.texts : channelDefaults.texts,
      watermark: rawWm
        ? { ...channelDefaults.watermark, ...rawWm }
        : channelDefaults.watermark
    },
    name
  )

  const needsImage =
    merged.watermark.on &&
    merged.watermark.kind === 'image' &&
    !merged.watermark.image_path &&
    !merged.watermark.image_file
  const hasChannelImage =
    !!(channelDefaults.watermark.image_path || channelDefaults.watermark.image_file)

  if (needsImage && hasChannelImage) {
    merged.watermark = {
      ...merged.watermark,
      kind: 'image',
      on: true,
      image_path: channelDefaults.watermark.image_path,
      image_file: channelDefaults.watermark.image_file,
      image_name: channelDefaults.watermark.image_name || merged.watermark.image_name,
      scale: merged.watermark.scale || channelDefaults.watermark.scale,
      position: merged.watermark.position || channelDefaults.watermark.position,
      px: merged.watermark.px ?? channelDefaults.watermark.px,
      py: merged.watermark.py ?? channelDefaults.watermark.py
    }
  }

  return merged
}

/** 채널 기본 이미지 워터마크 필드만 가져온다 */
export function channelWatermarkImage(workspace) {
  const wm = normalizeEditOptions(workspace?.default_edit_options || {}, workspace?.name || 'Studio')
    .watermark
  if (!wm?.on || wm.kind !== 'image') return null
  if (!wm.image_path && !wm.image_file) return null
  return {
    kind: 'image',
    on: true,
    image_path: wm.image_path,
    image_file: wm.image_file,
    image_name: wm.image_name,
    scale: wm.scale,
    position: wm.position,
    px: wm.px,
    py: wm.py
  }
}

export function newTextLayer(index = 0) {
  return {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: '문구',
    x: 0.5,
    y: Math.min(0.85, 0.1 + index * 0.08),
    size: 36,
    color: '#FFFFFF',
    font: 'apple-sd',
    align: 'center',
    weight: 'semibold',
    shadow: true,
    stroke: true
  }
}
