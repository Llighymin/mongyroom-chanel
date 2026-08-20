/** 릴스 캔버스 */
export const REEL_W = 1080
export const REEL_H = 1920

export const FILL_PRESETS = [
  { id: 'black', label: '검정', value: '#000000' },
  { id: 'white', label: '흰색', value: '#FFFFFF' },
  { id: 'dark', label: '다크 그레이', value: '#1A1A1A' },
  { id: 'cream', label: '크림', value: '#F4EFE6' }
]

const EMOJI_STACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"'

export const FONT_OPTIONS = [
  { id: 'apple-sd', label: '애플 SD 고딕', css: '"Apple SD Gothic Neo", "AppleGothic", sans-serif', mac: 'Apple SD Gothic Neo' },
  { id: 'system', label: '시스템', css: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif', mac: null },
  { id: 'helvetica', label: 'Helvetica Neue', css: '"Helvetica Neue", Helvetica, sans-serif', mac: 'Helvetica Neue' },
  { id: 'arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif', mac: 'Arial' },
  { id: 'verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif', mac: 'Verdana' },
  { id: 'avenir', label: 'Avenir', css: 'Avenir, "Avenir Next", sans-serif', mac: 'Avenir' },
  { id: 'avenir-next', label: 'Avenir Next', css: '"Avenir Next", Avenir, sans-serif', mac: 'Avenir Next' },
  { id: 'futura', label: 'Futura', css: 'Futura, sans-serif', mac: 'Futura' },
  { id: 'gill-sans', label: 'Gill Sans', css: '"Gill Sans", sans-serif', mac: 'Gill Sans' },
  { id: 'optima', label: 'Optima', css: 'Optima, sans-serif', mac: 'Optima' },
  { id: 'hiragino-sans', label: '히라기노 산스', css: '"Hiragino Sans", sans-serif', mac: 'Hiragino Sans' },
  { id: 'georgia', label: 'Georgia', css: 'Georgia, "Times New Roman", serif', mac: 'Georgia' },
  { id: 'times', label: 'Times New Roman', css: '"Times New Roman", Times, serif', mac: 'Times New Roman' },
  { id: 'palatino', label: 'Palatino', css: 'Palatino, "Palatino Linotype", serif', mac: 'Palatino' },
  { id: 'baskerville', label: 'Baskerville', css: 'Baskerville, serif', mac: 'Baskerville' },
  { id: 'didot', label: 'Didot', css: 'Didot, serif', mac: 'Didot' },
  { id: 'american-typewriter', label: 'American Typewriter', css: '"American Typewriter", serif', mac: 'American Typewriter' },
  { id: 'hiragino-mincho', label: '히라기노 명조', css: '"Hiragino Mincho ProN", serif', mac: 'Hiragino Mincho ProN' },
  { id: 'menlo', label: 'Menlo', css: 'Menlo, Monaco, monospace', mac: 'Menlo' },
  { id: 'monaco', label: 'Monaco', css: 'Monaco, monospace', mac: 'Monaco' },
  { id: 'courier', label: 'Courier', css: '"Courier New", Courier, monospace', mac: 'Courier' },
  { id: 'impact', label: 'Impact', css: 'Impact, Haettenschweiler, sans-serif', mac: 'Impact' },
  { id: 'copperplate', label: 'Copperplate', css: 'Copperplate, sans-serif', mac: 'Copperplate' },
  { id: 'noteworthy', label: 'Noteworthy', css: 'Noteworthy, sans-serif', mac: 'Noteworthy' },
  { id: 'marker-felt', label: 'Marker Felt', css: '"Marker Felt", cursive', mac: 'Marker Felt' },
  { id: 'chalkboard', label: 'Chalkboard', css: '"Chalkboard SE", Chalkboard, sans-serif', mac: 'Chalkboard SE' }
]

/** 앱 설정에서 등록한 커스텀 폰트 (렌더러에서 setCustomFonts로 주입) */
let customFonts = []

export function setCustomFonts(list) {
  customFonts = Array.isArray(list) ? list.filter((f) => f && f.id) : []
}

export function getCustomFonts() {
  return customFonts
}

export function isCustomFontId(id) {
  return String(id || '').startsWith('cf:')
}

export function allFontOptions() {
  const extras = customFonts.map((f) => ({
    id: f.id,
    label: f.label || '사용자 폰트',
    css: `"${f.cssFamily}", sans-serif`,
    mac: f.postscriptName || '',
    custom: true
  }))
  return [...FONT_OPTIONS, ...extras]
}

export function normalizeFontId(id, fallback = 'apple-sd') {
  const s = String(id || '').trim()
  if (!s) return fallback
  if (FONT_OPTIONS.some((f) => f.id === s) || isCustomFontId(s)) return s
  return fallback
}

export function clampTracking(v, fallback = 0) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(0.4, Math.max(-0.12, n))
}

export const WEIGHT_OPTIONS = [
  { id: 'thin', label: '가늘게 (100)', css: 100 },
  { id: 'extralight', label: '아주 가늘게 (200)', css: 200 },
  { id: 'light', label: '얇게 (300)', css: 300 },
  { id: 'regular', label: '보통 (400)', css: 400 },
  { id: 'medium', label: '중간 (500)', css: 500 },
  { id: 'semibold', label: '세미볼드 (600)', css: 600 },
  { id: 'bold', label: '굵게 (700)', css: 700 },
  { id: 'extrabold', label: '아주 굵게 (800)', css: 800 },
  { id: 'black', label: '최대 (900)', css: 900 }
]

const WEIGHT_BY_ID = Object.fromEntries(WEIGHT_OPTIONS.map((w) => [w.id, w.css]))
const WEIGHT_BY_CSS = Object.fromEntries(WEIGHT_OPTIONS.map((w) => [w.css, w]))

/** 문자열 id·숫자(100~900) 모두 허용 */
export function normalizeWeight(value, fallback = 700) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const snapped = Math.round(value / 100) * 100
    return Math.min(900, Math.max(100, snapped))
  }
  const s = String(value || '').trim()
  if (WEIGHT_BY_ID[s] != null) return WEIGHT_BY_ID[s]
  const n = Number(s)
  if (Number.isFinite(n)) {
    const snapped = Math.round(n / 100) * 100
    return Math.min(900, Math.max(100, snapped))
  }
  return normalizeWeight(fallback, 700)
}

export function weightCss(value) {
  return normalizeWeight(value, 700)
}

export function fontCss(id) {
  const custom = customFonts.find((f) => f.id === id)
  if (custom?.cssFamily) return `"${custom.cssFamily}", ${EMOJI_STACK}, sans-serif`
  const found = FONT_OPTIONS.find((f) => f.id === id)
  return `${found?.css || FONT_OPTIONS[0].css}, ${EMOJI_STACK}`
}

export function weightLabel(value) {
  const css = weightCss(value)
  return WEIGHT_BY_CSS[css]?.label || `굵기 ${css}`
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
      tracking: 0,
      shadow: true,
      stroke: true
    },
    texts: [],
    images: []
  }
}

/** 줄바꿈·연속 공백을 한 줄 문구로 정리 (이모지·ZWJ 시퀀스는 유지) */
export function singleLineText(value, maxLen = 160) {
  return Array.from(String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim())
    .slice(0, maxLen)
    .join('')
}

export function clampBoxW(v, fallback = 0.88) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0.35, n))
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
    text: singleLineText(wmIn.text || raw.watermark_text || base.watermark.text, 80),
    image_path: imagePath,
    image_name: String(wmIn.image_name || ''),
    image_file: imageFile,
    position: pos.id,
    px: clamp01(wmIn.px, pos.px),
    py: clamp01(wmIn.py, pos.py),
    scale: Math.min(0.8, Math.max(0.06, Number(wmIn.scale) || base.watermark.scale)),
    size: Math.min(96, Math.max(16, Number(wmIn.size) || base.watermark.size)),
    font: normalizeFontId(wmIn.font, base.watermark.font),
    align: 'center',
    color: hexColor(wmIn.color, base.watermark.color),
    weight: normalizeWeight(wmIn.weight, 600),
    tracking: clampTracking(wmIn.tracking, 0),
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
          text: singleLineText(t?.text),
          x: clamp01(t?.x, 0.5),
          y: clamp01(t?.y, 0.12 + i * 0.08),
          size: Math.min(96, Math.max(16, Number(t?.size) || 36)),
          boxW: clampBoxW(t?.boxW),
          color: hexColor(t?.color, '#FFFFFF'),
          font: normalizeFontId(t?.font, 'apple-sd'),
          align: 'center',
          weight: normalizeWeight(t?.weight, 800),
          tracking: clampTracking(t?.tracking, 0),
          shadow: t?.shadow !== false,
          stroke: t?.stroke !== false
        }))
        .filter((t) => t.text.trim())
        .slice(0, 8)
    : []

  const images = Array.isArray(raw.images)
    ? raw.images
        .map((im, i) => normalizeImageLayer(im, i))
        .filter((im) => im.image_file || im.image_path)
        .slice(0, 8)
    : []

  return {
    share_to_feed: raw.share_to_feed !== false,
    fill_color: hexColor(raw.fill_color, base.fill_color),
    crop: clampCrop(raw.crop || base.crop),
    watermark,
    texts,
    images
  }
}

function normalizeImageLayer(im = {}, index = 0) {
  const imagePath = String(im.image_path || '')
  const imageFile = basenamePath(im.image_file) || basenamePath(imagePath)
  return {
    id: String(im.id || `img${index + 1}`),
    image_path: imagePath,
    image_file: imageFile,
    image_name: String(im.image_name || ''),
    x: clamp01(im.x, 0.5),
    y: clamp01(im.y, 0.28 + index * 0.12),
    scale: Math.min(0.8, Math.max(0.06, Number(im.scale) || 0.28))
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
    images: n.images,
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
      images: Array.isArray(rawObj.images) ? rawObj.images : channelDefaults.images,
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
    boxW: 0.88,
    color: '#FFFFFF',
    font: 'apple-sd',
    align: 'center',
    weight: 800,
    tracking: 0,
    shadow: true,
    stroke: true
  }
}

export function newImageLayer(index = 0, file = {}) {
  return {
    id: `img${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    image_path: String(file.path || ''),
    image_file: String(file.filename || ''),
    image_name: String(file.name || ''),
    x: 0.5,
    y: Math.min(0.82, 0.28 + index * 0.12),
    scale: 0.28
  }
}
