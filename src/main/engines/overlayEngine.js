import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { REEL_W, REEL_H, fontMac } from '../../shared/editOptions.js'

const execFileAsync = promisify(execFile)

/**
 * 텍스트 레이어(워터마크 글자 + 추가 문구)를 투명 PNG로 그린다.
 */
export async function renderTextOverlayPng(workDir, items) {
  const list = (items || []).filter((t) => String(t.text || '').trim())
  if (!list.length) return null

  mkdirSync(workDir, { recursive: true })
  const jsonPath = join(workDir, 'overlays.json')
  const outPath = join(workDir, 'overlays.png')
  writeFileSync(
    jsonPath,
    JSON.stringify({
      items: list.map((t) => ({
        text: String(t.text).slice(0, 120),
        x: Number(t.x) || 0.5,
        y: Number(t.y) || 0.5,
        size: Number(t.size) || 36,
        color: t.color || '#FFFFFF',
        font: fontMac(t.font) || '',
        align: 'center',
        weight: t.weight || 'semibold',
        shadow: t.shadow !== false,
        stroke: t.stroke !== false
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
