import React, { useEffect, useRef, useState } from 'react'
import { Field, TextInput, Button } from './ui.jsx'
import ReelPreview from './ReelPreview.jsx'
import {
  FILL_PRESETS,
  WATERMARK_POSITIONS,
  FONT_OPTIONS,
  WEIGHT_OPTIONS,
  resolveEditOptions,
  channelWatermarkImage,
  newTextLayer
} from '@shared/editOptions.js'

function getVideoBox(video) {
  if (!video?.videoWidth) return null
  const { videoWidth, videoHeight, clientWidth, clientHeight } = video
  const vr = videoWidth / videoHeight
  const er = clientWidth / clientHeight
  let w, h, left, top
  if (er > vr) {
    h = clientHeight
    w = h * vr
    left = (clientWidth - w) / 2
    top = 0
  } else {
    w = clientWidth
    h = w / vr
    left = 0
    top = (clientHeight - h) / 2
  }
  return { left, top, w, h }
}

function CropPicker({ src, crop, disabled, onChange, onFrame, onSize }) {
  const videoRef = useRef(null)
  const wrapRef = useRef(null)
  const drag = useRef(null)
  const [box, setBox] = useState(null)
  const [failed, setFailed] = useState(false)

  const syncBox = () => setBox(getVideoBox(videoRef.current))

  const captureFrame = () => {
    const v = videoRef.current
    if (!v?.videoWidth) return
    onSize?.({ w: v.videoWidth, h: v.videoHeight })
    try {
      const c = document.createElement('canvas')
      const w = Math.min(540, v.videoWidth)
      c.width = w
      c.height = Math.round((w * v.videoHeight) / v.videoWidth)
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
      onFrame?.(c.toDataURL('image/jpeg', 0.72))
    } catch {
      /* CORS 등으로 캡처 실패해도 thumb_url 사용 */
    }
  }

  useEffect(() => {
    setFailed(false)
    const v = videoRef.current
    if (!v) return undefined
    const onMeta = () => {
      syncBox()
      captureFrame()
    }
    v.addEventListener('loadedmetadata', onMeta)
    window.addEventListener('resize', syncBox)
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      window.removeEventListener('resize', syncBox)
    }
  }, [src])

  const toNorm = (clientX, clientY) => {
    const wrap = wrapRef.current.getBoundingClientRect()
    const b = box
    if (!b) return null
    const x = (clientX - wrap.left - b.left) / b.w
    const y = (clientY - wrap.top - b.top) / b.h
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y))
    }
  }

  const onPointerDown = (e) => {
    if (disabled) return
    const p = toNorm(e.clientX, e.clientY)
    if (!p) return
    drag.current = { x0: p.x, y0: p.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const p = toNorm(e.clientX, e.clientY)
    if (!p) return
    const x = Math.min(drag.current.x0, p.x)
    const y = Math.min(drag.current.y0, p.y)
    const w = Math.abs(p.x - drag.current.x0)
    const h = Math.abs(p.y - drag.current.y0)
    onChange({ x, y, w: Math.max(0.02, w), h: Math.max(0.02, h) })
  }
  const onPointerUp = () => {
    drag.current = null
  }

  if (!src) {
    return (
      <div className="h-56 rounded-xl bg-[var(--surface-2)] grid place-items-center text-[13px] text-[var(--muted)] px-4 text-center">
        원본을 불러오면 여기서 영역을 드래그해 고를 수 있어요.
      </div>
    )
  }
  if (failed) {
    return (
      <div className="h-56 rounded-xl bg-[var(--surface-2)] grid place-items-center text-[13px] text-[var(--muted)]">
        원본 미리보기를 재생하지 못했어요. 숫자로 영역을 지정해 주세요.
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative w-full max-h-[360px] rounded-xl overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        controls
        preload="metadata"
        onLoadedMetadata={() => {
          syncBox()
          try {
            if (videoRef.current && videoRef.current.currentTime < 0.3) {
              videoRef.current.currentTime = 0.8
            } else {
              captureFrame()
            }
          } catch {
            captureFrame()
          }
        }}
        onSeeked={captureFrame}
        onError={() => setFailed(true)}
        className="w-full max-h-[360px] object-contain block"
      />
      {box && (
        <div
          className="absolute left-0 right-0 top-0 bottom-12 z-10 touch-none"
          style={{ cursor: disabled ? 'default' : 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div
            className="absolute border-2 border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
            style={{
              left: box.left + crop.x * box.w,
              top: box.top + crop.y * box.h,
              width: crop.w * box.w,
              height: crop.h * box.h
            }}
          />
        </div>
      )}
    </div>
  )
}

function StyleBar({ font, size, color, weight, shadow, stroke, disabled, onChange }) {
  const chip = (on) =>
    on
      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
      : 'border-[var(--line)]'
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="폰트">
          <select
            disabled={disabled}
            value={font || 'apple-sd'}
            onChange={(e) => onChange({ font: e.target.value })}
            className="no-drag bg-[var(--paper)] border border-[var(--line)] rounded-[10px] px-2.5 py-2 text-sm text-[var(--ink)]"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </Field>
        <Field label="굵기">
          <select
            disabled={disabled}
            value={weight || 'semibold'}
            onChange={(e) => onChange({ weight: e.target.value })}
            className="no-drag bg-[var(--paper)] border border-[var(--line)] rounded-[10px] px-2.5 py-2 text-sm text-[var(--ink)]"
          >
            {WEIGHT_OPTIONS.map((w) => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
        </Field>
        <Field label={`크기 ${size}`}>
          <input
            type="range"
            min="16"
            max="96"
            step="1"
            disabled={disabled}
            value={size || 36}
            className="no-drag w-32"
            onChange={(e) => onChange({ size: Number(e.target.value) })}
          />
        </Field>
        <Field label="색">
          <input
            type="color"
            disabled={disabled}
            value={color || '#FFFFFF'}
            className="no-drag w-9 h-9 rounded-lg border border-[var(--line)]"
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ shadow: shadow === false })}
          className={`no-drag px-2.5 py-1 rounded-full border text-[12px] ${chip(shadow !== false)}`}
        >
          그림자 {shadow !== false ? '켜짐' : '꺼짐'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ stroke: stroke === false })}
          className={`no-drag px-2.5 py-1 rounded-full border text-[12px] ${chip(stroke !== false)}`}
        >
          테두리 {stroke !== false ? '켜짐' : '꺼짐'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ x: 0.5, px: 0.5 })}
          className="no-drag px-2.5 py-1 rounded-full border border-[var(--line)] text-[12px]"
        >
          가로 가운데
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ y: 0.5, py: 0.5 })}
          className="no-drag px-2.5 py-1 rounded-full border border-[var(--line)] text-[12px]"
        >
          세로 가운데
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ x: 0.5, y: 0.5, px: 0.5, py: 0.5, position: 'center' })}
          className="no-drag px-2.5 py-1 rounded-full border border-[var(--line)] text-[12px]"
        >
          정중앙
        </button>
      </div>
    </div>
  )
}

export default function EditStudio({
  workspace,
  opts,
  setOpts,
  job,
  disabled,
  preparing,
  onWorkspaceUpdated
}) {
  const [presets, setPresets] = useState([])
  const [presetName, setPresetName] = useState('')
  const [localThumb, setLocalThumb] = useState(null)
  const [localWmUrl, setLocalWmUrl] = useState(null)
  const [sourceSize, setSourceSize] = useState({ w: 16, h: 9 })
  const [selectedId, setSelectedId] = useState(null)
  const toastName = workspace?.name || 'Studio'

  const loadPresets = async () => {
    if (!window.api?.presets) return
    setPresets(await window.api.presets.list(workspace.id))
  }

  useEffect(() => {
    loadPresets()
    setLocalWmUrl(null)
  }, [workspace.id])

  const setCrop = (crop) => setOpts({ ...opts, crop: { ...opts.crop, ...crop } })
  const setWm = (patch) => setOpts({ ...opts, watermark: { ...opts.watermark, ...patch } })

  const applyPreset = (p) => {
    setLocalWmUrl(null)
    setOpts(resolveEditOptions(p.options || {}, workspace))
  }

  const savePreset = async () => {
    const name = presetName.trim() || `${toastName} 편집`
    await window.api.presets.save(workspace.id, name, opts)
    setPresetName('')
    await loadPresets()
  }

  const saveDefault = async () => {
    const updated = await window.api.workspaces.update(workspace.id, { default_edit_options: opts })
    onWorkspaceUpdated?.(updated)
  }

  const pickImage = async () => {
    const file = await window.api.assets.pickWatermark(workspace.id)
    if (!file) return
    setWm({
      kind: 'image',
      image_path: file.path,
      image_file: file.filename,
      image_name: file.name,
      on: true
    })
    setLocalWmUrl(file.url || null)
  }

  const wmPreview = localWmUrl || job?.watermark_preview_url || workspace?.watermark_preview_url
  const fill = opts.fill_color || '#000000'
  const thumbUrl = job?.thumb_url || localThumb
  const texts = opts.texts || []

  const patchText = (id, patch) => {
    setOpts({
      ...opts,
      texts: texts.map((x) => (x.id === id ? { ...x, ...patch } : x))
    })
  }

  const moveLayer = (id, x, y) => {
    if (id === 'watermark') setWm({ px: x, py: y, position: 'custom' })
    else patchText(id, { x, y })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 flex flex-col gap-3">
        <p className="text-[13px] font-bold text-[var(--ink)]">이 채널의 편집 프리셋</p>
        <p className="text-[12.5px] text-[var(--muted)] -mt-2">
          저장해 두면 다른 레퍼런스에도 같은 크롭·워터마크·문구를 바로 적용할 수 있어요.
        </p>
        <div className="flex flex-wrap gap-2">
          {presets.length === 0 && (
            <span className="text-[12.5px] text-[var(--muted)]">아직 저장된 프리셋이 없어요.</span>
          )}
          {presets.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1">
              <Button variant="soft" size="sm" disabled={disabled} onClick={() => applyPreset(p)}>
                {p.name}
              </Button>
              <button
                type="button"
                disabled={disabled}
                className="no-drag text-[11px] text-[var(--muted)] hover:text-[var(--crit)] px-1"
                onClick={async () => {
                  await window.api.presets.remove(p.id)
                  loadPresets()
                }}
              >
                삭제
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <Field label="프리셋 이름">
            <TextInput
              value={presetName}
              disabled={disabled}
              placeholder="예: 홈카페 기본"
              onChange={(e) => setPresetName(e.target.value)}
            />
          </Field>
          <Button variant="soft" size="sm" disabled={disabled} onClick={savePreset}>
            현재 설정 저장
          </Button>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={saveDefault}>
            이 채널 기본값으로
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h4 className="text-[14px] font-bold text-[var(--ink)]">1. 추출할 영역</h4>
        <p className="text-[12.5px] text-[var(--muted)] -mt-2">
          원본 영상 위에서 드래그하면 그 사각형만 잘라 릴스에 넣어요. (시간이 아니라 화면 좌표)
        </p>
        {preparing && (
          <p className="text-[13px] text-[var(--accent)]">원본을 불러오는 중이에요…</p>
        )}
        <CropPicker
          src={job?.source_url}
          crop={opts.crop}
          disabled={disabled || preparing}
          onChange={setCrop}
          onFrame={setLocalThumb}
          onSize={setSourceSize}
        />
        <div className="grid grid-cols-4 gap-2">
          {['x', 'y', 'w', 'h'].map((k) => (
            <Field key={k} label={k.toUpperCase()}>
              <TextInput
                type="number"
                step="0.01"
                min="0"
                max="1"
                disabled={disabled}
                value={Number(opts.crop?.[k] ?? 0).toFixed(2)}
                onChange={(e) => setCrop({ [k]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h4 className="text-[14px] font-bold text-[var(--ink)]">2. 빈 영역 색</h4>
        <p className="text-[12.5px] text-[var(--muted)] -mt-2">
          자른 영상이 9:16에 딱 맞지 않으면 남는 칸을 이 색으로 채워요.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {FILL_PRESETS.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => setOpts({ ...opts, fill_color: c.value })}
              className={`no-drag px-3 py-1.5 rounded-full border text-[13px] ${
                fill.toUpperCase() === c.value
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--line)]'
              }`}
            >
              <span className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle border border-black/10" style={{ background: c.value }} />
              {c.label}
            </button>
          ))}
          <input
            type="color"
            className="no-drag w-9 h-9 rounded-lg border border-[var(--line)] bg-transparent"
            disabled={disabled}
            value={fill}
            onChange={(e) => setOpts({ ...opts, fill_color: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] items-start">
      <div className="flex flex-col gap-6 min-w-0">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[14px] font-bold text-[var(--ink)]">3. 영상에 넣을 문구</h4>
          <Button
            variant="soft"
            size="sm"
            disabled={disabled || texts.length >= 8}
            onClick={() => setOpts({ ...opts, texts: [...texts, newTextLayer(texts.length)] })}
          >
            문구 추가
          </Button>
        </div>
        {texts.length === 0 && (
          <p className="text-[12.5px] text-[var(--muted)]">워터마크 외에 제목·해시태그 등을 더 올릴 수 있어요.</p>
        )}
        {texts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border p-3 flex flex-col gap-2 ${
              selectedId === t.id ? 'border-[var(--accent)]' : 'border-[var(--line)]'
            }`}
            onClick={() => setSelectedId(t.id)}
          >
            <div className="flex gap-2 items-start">
              <TextInput
                value={t.text}
                disabled={disabled}
                placeholder="화면에 넣을 글"
                onChange={(e) => patchText(t.id, { text: e.target.value })}
              />
              <Button
                variant="danger"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  setOpts({ ...opts, texts: texts.filter((x) => x.id !== t.id) })
                  if (selectedId === t.id) setSelectedId(null)
                }}
              >
                삭제
              </Button>
            </div>
            <StyleBar
              font={t.font}
              size={t.size}
              color={t.color}
              weight={t.weight}
              shadow={t.shadow}
              stroke={t.stroke}
              disabled={disabled}
              onChange={(patch) => patchText(t.id, patch)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3" onClick={() => setSelectedId('watermark')}>
        <label className="flex items-center gap-3 text-[14px] font-bold text-[var(--ink)]">
          <input
            type="checkbox"
            className="no-drag accent-[var(--accent)] w-4 h-4"
            checked={!!opts.watermark?.on}
            disabled={disabled}
            onChange={(e) => setWm({ on: e.target.checked })}
          />
          4. 워터마크
        </label>
        {opts.watermark?.on && (
          <>
            <div className="flex gap-2">
              <Button
                variant={opts.watermark.kind === 'text' ? 'primary' : 'soft'}
                size="sm"
                disabled={disabled}
                onClick={() => setWm({ kind: 'text' })}
              >
                글자
              </Button>
              <Button
                variant={opts.watermark.kind === 'image' ? 'primary' : 'soft'}
                size="sm"
                disabled={disabled}
                onClick={() => {
                  const fromChannel = channelWatermarkImage(workspace)
                  if (fromChannel && !opts.watermark.image_path && !opts.watermark.image_file) {
                    setWm(fromChannel)
                    setLocalWmUrl(workspace.watermark_preview_url || null)
                  } else {
                    setWm({ kind: 'image', on: true })
                  }
                }}
              >
                이미지
              </Button>
            </div>
            {opts.watermark.kind === 'text' ? (
              <Field label="워터마크 문구">
                <TextInput
                  value={opts.watermark.text}
                  disabled={disabled}
                  placeholder="예: 홈카페"
                  onChange={(e) => setWm({ text: e.target.value })}
                />
              </Field>
            ) : (
              <div className="flex items-center gap-3">
                {wmPreview ? (
                  <img src={wmPreview} alt="" className="h-12 max-w-[120px] object-contain rounded bg-[var(--surface-2)]" />
                ) : (
                  <div className="h-12 w-20 rounded bg-[var(--surface-2)] grid place-items-center text-[11px] text-[var(--muted)]">
                    없음
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[13px] text-[var(--ink)] truncate">{opts.watermark.image_name || '이미지를 선택해 주세요'}</p>
                  <Button variant="soft" size="sm" disabled={disabled} onClick={pickImage} className="mt-1">
                    이미지 고르기
                  </Button>
                </div>
              </div>
            )}

            {opts.watermark.kind === 'text' && (
              <StyleBar
                font={opts.watermark.font}
                size={opts.watermark.size}
                color={opts.watermark.color}
                weight={opts.watermark.weight}
                shadow={opts.watermark.shadow}
                stroke={opts.watermark.stroke}
                disabled={disabled}
                onChange={(patch) => setWm(patch)}
              />
            )}

            <Field label="위치" hint="미리보기에서 끌어 옮기거나, 아래 칸을 누르세요.">
              <div className="flex flex-wrap gap-2">
                {WATERMARK_POSITIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setWm({ position: p.id, px: p.px, py: p.py })}
                    className={`no-drag px-2.5 py-1 rounded-full border text-[12.5px] ${
                      opts.watermark.position === p.id
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--line)]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
            {opts.watermark.kind === 'image' && (
              <Field label="이미지 크기">
                <input
                  type="range"
                  min="0.08"
                  max="0.6"
                  step="0.02"
                  disabled={disabled}
                  value={opts.watermark.scale}
                  className="no-drag w-40"
                  onChange={(e) => setWm({ scale: Number(e.target.value) })}
                />
              </Field>
            )}
          </>
        )}
      </div>
      </div>

      <div className="lg:sticky lg:top-4">
        <ReelPreview
          opts={opts}
          thumbUrl={thumbUrl}
          wmImageUrl={wmPreview}
          sourceSize={sourceSize}
          selectedId={selectedId}
          disabled={disabled}
          onSelect={setSelectedId}
          onMove={moveLayer}
        />
      </div>
      </div>
    </div>
  )
}
