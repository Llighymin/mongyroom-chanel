import { existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { resolveTools, ffmpegHasFilter } from '../tools.js'

const execFileAsync = promisify(execFile)

const TARGET_W = 1080
const TARGET_H = 1920

/**
 * 워터마크 엔진
 * 1) ffmpeg drawtext 지원 시 필터 사용
 * 2) 없으면 macOS Swift(AppKit)로 PNG 생성 후 overlay
 */
export class WatermarkEngine {
  constructor() {
    this.name = '워터마크 엔진'
  }

  /**
   * @param {{
   *   enabled?: boolean,
   *   watermark_on?: boolean,
   *   text?: string,
   *   watermark_text?: string,
   *   workDir: string
   * }} options
   */
  async prepare(options = {}) {
    const enabled = !!options.enabled || !!options.watermark_on
    const text = String(options.text || options.watermark_text || '').trim() || 'Studio'
    if (!enabled) {
      return {
        enabled: false,
        text,
        mode: 'none',
        vfExtra: null,
        overlayPath: null,
        fontfile: null
      }
    }

    const { ffmpeg } = resolveTools()
    const canDrawText = ffmpeg ? await ffmpegHasFilter(ffmpeg, 'drawtext') : false

    if (canDrawText) {
      const fontfile = this.resolveFontFile()
      const escaped = escapeDrawText(text)
      const fontPart = fontfile ? `:fontfile='${escapeFilterPath(fontfile)}'` : ''
      const vfExtra =
        `drawtext=text='${escaped}'${fontPart}` +
        `:fontsize=36:fontcolor=white@0.85:borderw=2:bordercolor=black@0.4` +
        `:x=(w-text_w)/2:y=h-th-80`
      return {
        enabled: true,
        text,
        mode: 'drawtext',
        vfExtra,
        overlayPath: null,
        fontfile
      }
    }

    mkdirSync(options.workDir, { recursive: true })
    const overlayPath = join(options.workDir, 'watermark.png')
    await this.renderPngOverlay(text, overlayPath, TARGET_W, TARGET_H)
    return {
      enabled: true,
      text,
      mode: 'overlay',
      vfExtra: null,
      overlayPath,
      fontfile: null
    }
  }

  /** @deprecated prepare() 사용 */
  build(options = {}) {
    const enabled = !!options.enabled || !!options.watermark_on
    const text = String(options.text || options.watermark_text || '').trim() || 'Studio'
    if (!enabled) {
      return { enabled: false, text, filter: null, fontfile: null }
    }
    const fontfile = this.resolveFontFile()
    const escaped = escapeDrawText(text)
    const fontPart = fontfile ? `:fontfile='${escapeFilterPath(fontfile)}'` : ''
    const filter =
      `drawtext=text='${escaped}'${fontPart}` +
      `:fontsize=36:fontcolor=white@0.85:borderw=2:bordercolor=black@0.4` +
      `:x=(w-text_w)/2:y=h-th-80`
    return { enabled: true, text, filter, fontfile }
  }

  resolveFontFile() {
    const candidates = [
      '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
      '/System/Library/Fonts/Supplemental/Arial.ttf',
      '/Library/Fonts/Arial.ttf',
      '/System/Library/Fonts/Helvetica.ttc',
      join(homedir(), 'Library/Fonts/Arial.ttf')
    ]
    return candidates.find((p) => existsSync(p)) || null
  }

  async renderPngOverlay(text, outPath, width, height) {
    const scriptPath = ensureSwiftScript(join(outPath, '..'))
    try {
      await execFileAsync(
        '/usr/bin/swift',
        [scriptPath, text, outPath, String(width), String(height)],
        { timeout: 60000 }
      )
    } catch (e) {
      const msg = e?.stderr?.toString?.() || e?.message || String(e)
      throw new Error(
        `워터마크 이미지를 만들지 못했어요. 워터마크를 끄고 다시 시도해 주세요. (${msg.trim().slice(0, 200)})`
      )
    }
    if (!existsSync(outPath)) {
      throw new Error('워터마크 이미지 파일이 생성되지 않았어요. 워터마크를 끄고 다시 시도해 주세요.')
    }
  }
}

function ensureSwiftScript(workDir) {
  const fromProject = join(process.cwd(), 'src/main/engines/mac/renderWatermark.swift')
  if (existsSync(fromProject)) return fromProject

  mkdirSync(workDir, { recursive: true })
  const embedded = join(workDir, 'renderWatermark.swift')
  writeFileSync(embedded, SWIFT_SOURCE, 'utf8')
  return embedded
}

const SWIFT_SOURCE = `#!/usr/bin/env swift
import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else {
  fputs("usage: renderWatermark.swift <text> <out.png> [width] [height]\\n", stderr)
  exit(1)
}
let text = args[1]
let outPath = args[2]
let width = Int(args.count > 3 ? args[3] : "1080") ?? 1080
let height = Int(args.count > 4 ? args[4] : "1920") ?? 1920

guard let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: width,
  pixelsHigh: height,
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 0
) else {
  fputs("failed to create bitmap\\n", stderr)
  exit(2)
}
rep.size = NSSize(width: width, height: height)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()
let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
let attrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 36, weight: .semibold),
  .foregroundColor: NSColor(calibratedWhite: 1.0, alpha: 0.9),
  .strokeColor: NSColor(calibratedWhite: 0.0, alpha: 0.45),
  .strokeWidth: -3.0,
  .paragraphStyle: paragraph
]
let ns = text as NSString
let textSize = ns.size(withAttributes: attrs)
let x = (CGFloat(width) - textSize.width) / 2
let y = CGFloat(80)
ns.draw(at: NSPoint(x: x, y: y), withAttributes: attrs)
NSGraphicsContext.restoreGraphicsState()
guard let png = rep.representation(using: .png, properties: [:]) else {
  fputs("failed to encode png\\n", stderr)
  exit(3)
}
do { try png.write(to: URL(fileURLWithPath: outPath)) }
catch {
  fputs("failed to write png: \\(error)\\n", stderr)
  exit(4)
}
`

function escapeDrawText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '%%')
}

function escapeFilterPath(path) {
  return String(path)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
}

export const watermarkEngine = new WatermarkEngine()
