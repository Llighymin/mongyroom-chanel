#!/usr/bin/env swift
import AppKit
import Foundation

// 사용: swift renderWatermark.swift "문구" /path/to/out.png [width] [height]
let args = CommandLine.arguments
guard args.count >= 3 else {
  fputs("usage: renderWatermark.swift <text> <out.png> [width] [height]\n", stderr)
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
  fputs("failed to create bitmap\n", stderr)
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
// AppKit 좌표계: 원점이 왼쪽 아래 → 하단 여백 80
let x = (CGFloat(width) - textSize.width) / 2
let y = CGFloat(80)
ns.draw(at: NSPoint(x: x, y: y), withAttributes: attrs)

NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else {
  fputs("failed to encode png\n", stderr)
  exit(3)
}

do {
  try png.write(to: URL(fileURLWithPath: outPath))
} catch {
  fputs("failed to write png: \(error)\n", stderr)
  exit(4)
}
