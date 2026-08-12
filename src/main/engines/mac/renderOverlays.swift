#!/usr/bin/env swift
import AppKit
import Foundation

// args: <jsonPath> <out.png> [width] [height]
let args = CommandLine.arguments
guard args.count >= 3 else {
  fputs("usage: renderOverlays.swift <json> <out.png> [w] [h]\n", stderr)
  exit(1)
}

let jsonPath = args[1]
let outPath = args[2]
let width = Int(args.count > 3 ? args[3] : "1080") ?? 1080
let height = Int(args.count > 4 ? args[4] : "1920") ?? 1920

struct Item: Decodable {
  let text: String
  let x: Double
  let y: Double
  let size: Double
  let color: String
  let font: String?
  let align: String?
  let weight: String?
  let shadow: Bool?
  let stroke: Bool?
}

struct Payload: Decodable {
  let items: [Item]
}

guard let data = try? Data(contentsOf: URL(fileURLWithPath: jsonPath)),
      let payload = try? JSONDecoder().decode(Payload.self, from: data) else {
  fputs("invalid json\n", stderr)
  exit(2)
}

func color(from hex: String) -> NSColor {
  var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
  if s.hasPrefix("#") { s.removeFirst() }
  guard s.count == 6, let n = UInt32(s, radix: 16) else {
    return NSColor(calibratedWhite: 1, alpha: 0.92)
  }
  let r = CGFloat((n >> 16) & 0xFF) / 255
  let g = CGFloat((n >> 8) & 0xFF) / 255
  let b = CGFloat(n & 0xFF) / 255
  return NSColor(calibratedRed: r, green: g, blue: b, alpha: 0.92)
}

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
  exit(3)
}
rep.size = NSSize(width: width, height: height)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()

func fontWeight(_ raw: String?) -> NSFont.Weight {
  switch raw {
  case "regular": return .regular
  case "medium": return .medium
  case "bold": return .bold
  default: return .semibold
  }
}

func pickFont(name: String?, size: CGFloat, weight: String?) -> NSFont {
  let w = fontWeight(weight)
  if let name, !name.isEmpty, let base = NSFont(name: name, size: size) {
    let desc = base.fontDescriptor.addingAttributes([
      .traits: [NSFontDescriptor.TraitKey.weight: NSNumber(value: Double(w.rawValue))]
    ])
    return NSFont(descriptor: desc, size: size) ?? base
  }
  return NSFont.systemFont(ofSize: size, weight: w)
}

for item in payload.items {
  let t = item.text as NSString
  if t.length == 0 { continue }
  let fontSize = max(14, item.size)
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  var attrs: [NSAttributedString.Key: Any] = [
    .font: pickFont(name: item.font, size: fontSize, weight: item.weight),
    .foregroundColor: color(from: item.color),
    .paragraphStyle: paragraph
  ]
  if item.stroke ?? true {
    attrs[.strokeColor] = NSColor(calibratedWhite: 0, alpha: 0.55)
    attrs[.strokeWidth] = -3.0
  }
  if item.shadow ?? true {
    let sh = NSShadow()
    sh.shadowColor = NSColor(calibratedWhite: 0, alpha: 0.55)
    sh.shadowBlurRadius = 3
    sh.shadowOffset = NSSize(width: 0, height: -1)
    attrs[.shadow] = sh
  }
  let size = t.size(withAttributes: attrs)
  let cx = CGFloat(item.x) * CGFloat(width)
  let cyFromTop = CGFloat(item.y) * CGFloat(height)
  let x = cx - size.width / 2
  // AppKit origin is bottom-left
  let y = CGFloat(height) - cyFromTop - size.height / 2
  t.draw(at: NSPoint(x: x, y: y), withAttributes: attrs)
}

NSGraphicsContext.restoreGraphicsState()
guard let png = rep.representation(using: .png, properties: [:]) else {
  fputs("failed to encode png\n", stderr)
  exit(4)
}
do {
  try png.write(to: URL(fileURLWithPath: outPath))
} catch {
  fputs("failed to write png: \(error)\n", stderr)
  exit(5)
}
