import React, { useRef, useState } from 'react'
import { fontCss, weightCss } from '@shared/editOptions.js'

const PREVIEW_W = 216
const PREVIEW_H = 384
const REEL_W = 1080
const SNAP = 0.022

function fittedVideoRect(crop, srcW, srcH, frameW, frameH) {
  const cw = Math.max(0.02, Number(crop?.w) || 1)
  const ch = Math.max(0.02, Number(crop?.h) || 1)
  const srcAspect = ((srcW || 16) * cw) / ((srcH || 9) * ch)
  const fa = frameW / frameH
  if (srcAspect > fa) {
    const w = frameW
    const h = w / srcAspect
    return { x: 0, y: (frameH - h) / 2, w, h }
  }
  const h = frameH
  const w = h * srcAspect
  return { x: (frameW - w) / 2, y: 0, w, h }
}

function textStyle(layer, scale) {
  const stroke = layer.stroke !== false
  const shadow = layer.shadow !== false
  return {
    color: layer.color || '#fff',
    fontSize: Math.max(8, (layer.size || 36) * scale),
    fontFamily: fontCss(layer.font),
    fontWeight: weightCss(layer.weight),
    textAlign: 'center',
    WebkitTextStroke: stroke ? '0.7px rgba(0,0,0,0.55)' : '0',
    textShadow: shadow ? '0 1px 3px rgba(0,0,0,0.55)' : 'none',
    whiteSpace: 'pre-wrap'
  }
}

let audioCtx = null
function playSnapTick() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const t = audioCtx.currentTime
    const o = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(720, t)
    o.frequency.exponentialRampToValueAtTime(240, t + 0.05)
    g.gain.setValueAtTime(0.07, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
    o.connect(g)
    g.connect(audioCtx.destination)
    o.start(t)
    o.stop(t + 0.08)
  } catch {
    /* 사운드 불가 환경 */
  }
}

function snapValue(v) {
  return Math.abs(v - 0.5) <= SNAP ? 0.5 : v
}

/**
 * 9:16 릴스 미리보기 — 크롭·채우기·문구·워터마크를 실시간으로 보여 준다.
 */
export default function ReelPreview({
  opts,
  thumbUrl,
  wmImageUrl,
  sourceSize,
  selectedId,
  disabled,
  onSelect,
  onMove
}) {
  const wrapRef = useRef(null)
  const drag = useRef(null)
  const lastSnap = useRef({ v: false, h: false })
  const [guides, setGuides] = useState({ v: false, h: false, pulse: 0 })
  const fill = opts.fill_color || '#000000'
  const crop = opts.crop || { x: 0, y: 0, w: 1, h: 1 }
  const srcW = sourceSize?.w || 16
  const srcH = sourceSize?.h || 9
  const videoBox = fittedVideoRect(crop, srcW, srcH, PREVIEW_W, PREVIEW_H)
  const scale = PREVIEW_W / REEL_W

  const toNorm = (clientX, clientY) => {
    const r = wrapRef.current.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height))
    }
  }

  const applySnap = (x, y, announce) => {
    const sx = snapValue(x)
    const sy = snapValue(y)
    const v = sx === 0.5
    const h = sy === 0.5
    if (announce) {
      const entered = (v && !lastSnap.current.v) || (h && !lastSnap.current.h)
      if (entered) {
        playSnapTick()
        setGuides((g) => ({ v, h, pulse: g.pulse + 1 }))
      } else {
        setGuides({ v, h, pulse: 0 })
      }
      lastSnap.current = { v, h }
    }
    return { x: sx, y: sy }
  }

  const onPointerDown = (e, id) => {
    if (disabled) return
    e.stopPropagation()
    onSelect?.(id)
    const p = toNorm(e.clientX, e.clientY)
    drag.current = { id }
    lastSnap.current = { v: false, h: false }
    e.currentTarget.setPointerCapture(e.pointerId)
    applySnap(p.x, p.y, false)
  }

  const onPointerMove = (e) => {
    if (!drag.current || disabled) return
    const p = toNorm(e.clientX, e.clientY)
    const snapped = applySnap(p.x, p.y, true)
    onMove?.(drag.current.id, snapped.x, snapped.y)
  }

  const onPointerUp = () => {
    drag.current = null
    setTimeout(() => setGuides({ v: false, h: false, pulse: 0 }), 180)
  }

  const texts = opts.texts || []
  const wm = opts.watermark

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-bold text-[var(--ink)]">실시간 미리보기</p>
      <p className="text-[12px] text-[var(--muted)] leading-relaxed">
        릴스 화면입니다. 문구를 끌어 옮기면 가운데에서 선이 맞춰져요.
      </p>
      <div
        ref={wrapRef}
        className="relative rounded-xl overflow-hidden border border-[var(--line)] shadow-soft mx-auto touch-none"
        style={{ width: PREVIEW_W, height: PREVIEW_H, background: fill, cursor: disabled ? 'default' : 'crosshair' }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className="absolute overflow-hidden"
          style={{
            left: videoBox.x,
            top: videoBox.y,
            width: videoBox.w,
            height: videoBox.h
          }}
        >
          {thumbUrl ? (
            <img
              alt=""
              src={thumbUrl}
              draggable={false}
              className="absolute max-w-none pointer-events-none"
              style={{
                width: `${100 / crop.w}%`,
                height: `${100 / crop.h}%`,
                left: `${(-crop.x / crop.w) * 100}%`,
                top: `${(-crop.y / crop.h) * 100}%`
              }}
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-[11px] text-white/70 bg-black/30 px-2 text-center">
              영상 장면 준비 중
            </div>
          )}
        </div>

        {guides.v && (
          <div
            key={`v-${guides.pulse}`}
            className="absolute top-0 bottom-0 w-[2px] bg-[#5B8CFF] pointer-events-none snap-line"
            style={{ left: '50%', transform: 'translateX(-50%)', boxShadow: '0 0 8px #5B8CFF' }}
          />
        )}
        {guides.h && (
          <div
            key={`h-${guides.pulse}`}
            className="absolute left-0 right-0 h-[2px] bg-[#5B8CFF] pointer-events-none snap-line"
            style={{ top: '50%', transform: 'translateY(-50%)', boxShadow: '0 0 8px #5B8CFF' }}
          />
        )}

        {texts.map((t) => (
          <div
            key={t.id}
            onPointerDown={(e) => onPointerDown(e, t.id)}
            className={`absolute max-w-[90%] px-0.5 leading-tight select-none ${
              selectedId === t.id ? 'outline outline-2 outline-[var(--accent)] outline-offset-2' : ''
            }`}
            style={{
              left: `${(t.x || 0.5) * 100}%`,
              top: `${(t.y || 0.12) * 100}%`,
              transform: 'translate(-50%, -50%)',
              cursor: disabled ? 'default' : 'grab',
              ...textStyle(t, scale)
            }}
          >
            {t.text || '문구'}
          </div>
        ))}

        {wm?.on && wm.kind === 'text' && (
          <div
            onPointerDown={(e) => onPointerDown(e, 'watermark')}
            className={`absolute max-w-[90%] leading-tight select-none ${
              selectedId === 'watermark' ? 'outline outline-2 outline-[var(--accent)] outline-offset-2' : ''
            }`}
            style={{
              left: `${(wm.px || 0.5) * 100}%`,
              top: `${(wm.py || 0.92) * 100}%`,
              transform: 'translate(-50%, -50%)',
              cursor: disabled ? 'default' : 'grab',
              ...textStyle(wm, scale)
            }}
          >
            {wm.text || '워터마크'}
          </div>
        )}

        {wm?.on && wm.kind === 'image' && (
          <img
            alt=""
            src={wmImageUrl || ''}
            draggable={false}
            onPointerDown={(e) => onPointerDown(e, 'watermark')}
            className={`absolute select-none ${
              selectedId === 'watermark' ? 'outline outline-2 outline-[var(--accent)] outline-offset-2' : ''
            }`}
            style={{
              left: `${(wm.px || 0.5) * 100}%`,
              top: `${(wm.py || 0.92) * 100}%`,
              width: `${(wm.scale || 0.22) * 100}%`,
              transform: 'translate(-50%, -50%)',
              cursor: disabled ? 'default' : 'grab',
              objectFit: 'contain'
            }}
          />
        )}
      </div>
      <style>{`
        @keyframes snapPulse {
          0% { opacity: 0.35; transform: scaleY(0.92); }
          40% { opacity: 1; }
          100% { opacity: 0.9; }
        }
        .snap-line { animation: snapPulse 160ms ease-out; }
      `}</style>
    </div>
  )
}
