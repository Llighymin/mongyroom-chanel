import { REEL_W, REEL_H } from '../../shared/editOptions.js'

function even(n) {
  const v = Math.floor(Number(n) || 0)
  return Math.max(2, v - (v % 2))
}

/**
 * 정규화(0~1) 크롭을 원본 픽셀로 바꾼다.
 */
export function pixelCrop(crop, srcW, srcH) {
  const W = Math.max(2, Number(srcW) || REEL_W)
  const H = Math.max(2, Number(srcH) || REEL_H)
  const x = Math.min(1, Math.max(0, Number(crop?.x) || 0))
  const y = Math.min(1, Math.max(0, Number(crop?.y) || 0))
  const w = Math.min(1, Math.max(0.02, Number(crop?.w) || 1))
  const h = Math.min(1, Math.max(0.02, Number(crop?.h) || 1))

  let cw = even(W * w)
  let ch = even(H * h)
  let cx = even(W * x)
  let cy = even(H * y)
  if (cx + cw > W) cx = even(Math.max(0, W - cw))
  if (cy + ch > H) cy = even(Math.max(0, H - ch))
  if (cw > W) cw = even(W)
  if (ch > H) ch = even(H)
  return { cx, cy, cw, ch }
}

export function ffmpegColor(hex) {
  const s = String(hex || '#000000').replace('#', '')
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `0x${s.toUpperCase()}`
  return '0x000000'
}

/**
 * 원본 영역 추출 → 9:16 안에 맞추기 → 빈 칸 색 채우기
 */
export function buildCanvasFilter(crop, fillColor, srcW, srcH) {
  const { cx, cy, cw, ch } = pixelCrop(crop, srcW, srcH)
  const color = ffmpegColor(fillColor)
  return (
    `crop=${cw}:${ch}:${cx}:${cy},` +
    `scale=${REEL_W}:${REEL_H}:force_original_aspect_ratio=decrease,` +
    `pad=${REEL_W}:${REEL_H}:(ow-iw)/2:(oh-ih)/2:color=${color}`
  )
}

/** 워터마크 overlay x/y — px/py는 이미지 중심점(0~1). 미리보기와 동일 */
export function overlayExpr(px, py) {
  const x = Math.min(1, Math.max(0, Number(px) || 0))
  const y = Math.min(1, Math.max(0, Number(py) || 0))
  return {
    x: `main_w*${x.toFixed(4)}-overlay_w/2`,
    y: `main_h*${y.toFixed(4)}-overlay_h/2`
  }
}
