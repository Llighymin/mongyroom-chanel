import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { REEL_W, REEL_H, normalizeWeight, clampBoxW, singleLineText, clampTracking } from '../../shared/editOptions.js'
import { fontRenderSpec } from '../fonts.js'

const execFileAsync = promisify(execFile)

/**
 * 텍스트·스티커 이미지를 투명 PNG로 그린다.
 */
export async function renderTextOverlayPng(workDir, items, images = []) {
  const list = (items || []).filter((t) => String(t.text || '').trim())
  const imgs = (images || []).filter((im) => im.path && existsSync(im.path))
  if (!list.length && !imgs.length) return null

  mkdirSync(workDir, { recursive: true })
  const jsonPath = join(workDir, 'overlays.json')
  const outPath = join(workDir, 'overlays.png')
  writeFileSync(
    jsonPath,
    JSON.stringify({
      items: list.map((t) => {
        const spec = fontRenderSpec(t.font)
        return {
          text: singleLineText(t.text),
          x: Number(t.x) || 0.5,
          y: Number(t.y) || 0.5,
          size: Number(t.size) || 36,
          boxW: clampBoxW(t.boxW),
          color: t.color || '#FFFFFF',
          font: spec.font,
          fontPath: spec.fontPath || '',
          align: 'center',
          weight: normalizeWeight(t.weight, 800),
          tracking: clampTracking(t.tracking, 0),
          shadow: t.shadow !== false,
          stroke: t.stroke !== false
        }
      }),
      images: imgs.map((im) => ({
        path: im.path,
        x: Number(im.x) || 0.5,
        y: Number(im.y) || 0.5,
        scale: Math.min(0.8, Math.max(0.06, Number(im.scale) || 0.28))
      }))
    }),
    'utf8'
  )

  const scriptPath = resolveSwiftScript(workDir)
  try {
    await execFileAsync(
      '/usr/bin/swift',
      [scriptPath, jsonPath, outPath, String(REEL_W), String(REEL_H)],
      { timeout: 60000 }
    )
  } catch (e) {
    const msg = e?.stderr?.toString?.() || e?.message || String(e)
    throw new Error(`텍스트 레이어를 만들지 못했어요. (${msg.trim().slice(0, 180)})`)
  }
  if (!existsSync(outPath)) throw new Error('텍스트 레이어 파일이 생성되지 않았어요.')
  return outPath
}

function resolveSwiftScript(workDir) {
  const fromProject = join(process.cwd(), 'src/main/engines/mac/renderOverlays.swift')
  if (existsSync(fromProject)) return fromProject
  const embedded = join(workDir, 'renderOverlays.swift')
  writeFileSync(embedded, SWIFT_FALLBACK, 'utf8')
  return embedded
}

const SWIFT_FALLBACK = (() => {
  try {
    const p = join(process.cwd(), 'src/main/engines/mac/renderOverlays.swift')
    if (existsSync(p)) return readFileSync(p, 'utf8')
  } catch {
    /* ignore */
  }
  return `import Foundation
fputs("overlay script missing\\n", stderr)
exit(1)
`
})()
