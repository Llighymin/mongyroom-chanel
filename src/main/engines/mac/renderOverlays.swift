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

/// CSS/레거시 문자열·숫자 weight를 Int(100~900)로 통일
func parseWeight(_ raw: Any?) -> Int {
  if let n = raw as? Int { return min(900, max(100, n)) }
  if let n = raw as? Double { return min(900, max(100, Int(n.rounded()))) }
  if let s = raw as? String {
    let map: [String: Int] = [
      "thin": 100, "extralight": 200, "ultralight": 200,
      "light": 300, "regular": 400, "normal": 400,
      "medium": 500, "semibold": 600, "bold": 700,
      "extrabold": 800, "heavy": 800, "black": 900
    ]
    if let v = map[s.lowercased()] { return v }
    if let n = Int(s) { return min(900, max(100, n)) }
    if let n = Double(s) { return min(900, max(100, Int(n.rounded()))) }
  }
  return 700
}

struct Item: Decodable {
  let text: String
  let x: Double
  let y: Double
  let size: Double
  let color: String
  let font: String?
  let align: String?
  let weight: Int
  let boxW: Double?
  let shadow: Bool?
  let stroke: Bool?

  enum CodingKeys: String, CodingKey {
    case text, x, y, size, color, font, align, weight, boxW, shadow, stroke
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    text = try c.decode(String.self, forKey: .text)
    x = try c.decode(Double.self, forKey: .x)
    y = try c.decode(Double.self, forKey: .y)
    size = try c.decode(Double.self, forKey: .size)
    color = try c.decode(String.self, forKey: .color)
    font = try c.decodeIfPresent(String.self, forKey: .font)
    align = try c.decodeIfPresent(String.self, forKey: .align)
    boxW = try c.decodeIfPresent(Double.self, forKey: .boxW)
    shadow = try c.decodeIfPresent(Bool.self, forKey: .shadow)
    stroke = try c.decodeIfPresent(Bool.self, forKey: .stroke)

    if let n = try? c.decode(Int.self, forKey: .weight) {
      weight = parseWeight(n)
    } else if let n = try? c.decode(Double.self, forKey: .weight) {
      weight = parseWeight(n)
    } else if let s = try? c.decode(String.self, forKey: .weight) {
      weight = parseWeight(s)
    } else {
      weight = 700
    }
  }
}

struct Payload: Decodable {
  let items: [Item]
}

let data: Data
do {
  data = try Data(contentsOf: URL(fileURLWithPath: jsonPath))
} catch {
  fputs("cannot read json: \(error)\n", stderr)
  exit(2)
}

let payload: Payload
do {
  payload = try JSONDecoder().decode(Payload.self, from: data)
} catch {
  fputs("invalid json: \(error)\n", stderr)
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

func fontWeight(_ raw: Int) -> NSFont.Weight {
  switch raw {
  case ..<150: return .ultraLight
  case 150..<250: return .thin
  case 250..<350: return .light
  case 350..<450: return .regular
  case 450..<550: return .medium
  case 550..<650: return .semibold
  case 650..<750: return .bold
  case 750..<850: return .heavy
  default: return .black
  }
}

func pickFont(name: String?, size: CGFloat, weight: Int) -> NSFont {
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
  let t = item.text.replacingOccurrences(of: "\n", with: " ")
    .replacingOccurrences(of: "\r", with: " ")
    .trimmingCharacters(in: .whitespacesAndNewlines) as NSString
  if t.length == 0 { continue }
  let maxW = CGFloat(item.boxW ?? 0.88) * CGFloat(width)
  var fontSize = CGFloat(max(14, item.size))

  func makeAttrs(_ size: CGFloat) -> [NSAttributedString.Key: Any] {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    var a: [NSAttributedString.Key: Any] = [
      .font: pickFont(name: item.font, size: size, weight: item.weight),
      .foregroundColor: color(from: item.color),
      .paragraphStyle: paragraph
    ]
    if item.stroke ?? true {
      a[.strokeColor] = NSColor(calibratedWhite: 0, alpha: 0.55)
      a[.strokeWidth] = -3.0
    }
    if item.shadow ?? true {
      let sh = NSShadow()
      sh.shadowColor = NSColor(calibratedWhite: 0, alpha: 0.55)
      sh.shadowBlurRadius = 3
      sh.shadowOffset = NSSize(width: 0, height: -1)
      a[.shadow] = sh
    }
    return a
  }

  var attrs = makeAttrs(fontSize)
  var size = t.size(withAttributes: attrs)
  if size.width > maxW && size.width > 0 {
    fontSize = max(12, fontSize * (maxW / size.width))
    attrs = makeAttrs(fontSize)
    size = t.size(withAttributes: attrs)
  }
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
