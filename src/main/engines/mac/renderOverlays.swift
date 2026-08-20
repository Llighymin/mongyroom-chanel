#!/usr/bin/env swift
import AppKit
import CoreText
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

func isEmojiScalar(_ u: Unicode.Scalar) -> Bool {
  if u.properties.isEmojiPresentation { return true }
  if u.properties.isEmoji && u.value > 0x238C { return true }
  return false
}

struct Item: Decodable {
  let text: String
  let x: Double
  let y: Double
  let size: Double
  let color: String
  let font: String?
  let fontPath: String?
  let align: String?
  let weight: Int
  let boxW: Double?
  let tracking: Double?
  let shadow: Bool?
  let stroke: Bool?

  enum CodingKeys: String, CodingKey {
    case text, x, y, size, color, font, fontPath, align, weight, boxW, tracking, shadow, stroke
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    text = try c.decode(String.self, forKey: .text)
    x = try c.decode(Double.self, forKey: .x)
    y = try c.decode(Double.self, forKey: .y)
    size = try c.decode(Double.self, forKey: .size)
    color = try c.decode(String.self, forKey: .color)
    font = try c.decodeIfPresent(String.self, forKey: .font)
    fontPath = try c.decodeIfPresent(String.self, forKey: .fontPath)
    align = try c.decodeIfPresent(String.self, forKey: .align)
    boxW = try c.decodeIfPresent(Double.self, forKey: .boxW)
    tracking = try c.decodeIfPresent(Double.self, forKey: .tracking)
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

struct ImageItem: Decodable {
  let path: String
  let x: Double
  let y: Double
  let scale: Double
}

struct Payload: Decodable {
  let items: [Item]?
  let images: [ImageItem]?
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

func fontFromPath(_ path: String, size: CGFloat) -> NSFont? {
  guard !path.isEmpty else { return nil }
  let url = URL(fileURLWithPath: path)
  CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
  guard let raw = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) else { return nil }
  let descs = raw as! [CTFontDescriptor]
  guard let desc = descs.first else { return nil }
  return CTFontCreateWithFontDescriptor(desc, size, nil) as NSFont
}

func pickFont(name: String?, path: String?, size: CGFloat, weight: Int) -> NSFont {
  let w = fontWeight(weight)
  if let path, !path.isEmpty, let custom = fontFromPath(path, size: size) {
    return custom
  }
  var base: NSFont
  if let name, !name.isEmpty, let named = NSFont(name: name, size: size) {
    let desc = named.fontDescriptor.addingAttributes([
      .traits: [NSFontDescriptor.TraitKey.weight: NSNumber(value: Double(w.rawValue))]
    ])
    base = NSFont(descriptor: desc, size: size) ?? named
  } else {
    base = NSFont.systemFont(ofSize: size, weight: w)
  }
  if let emoji = NSFont(name: "Apple Color Emoji", size: size) {
    let desc = base.fontDescriptor.addingAttributes([
      NSFontDescriptor.AttributeName(rawValue: kCTFontCascadeListAttribute as String): [emoji.fontDescriptor]
    ])
    return NSFont(descriptor: desc, size: size) ?? base
  }
  return base
}

func buildAttr(
  text: String,
  font: NSFont,
  color: NSColor,
  tracking: CGFloat,
  stroke: Bool,
  shadow: Bool
) -> NSAttributedString {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  var shadowObj: NSShadow?
  if shadow {
    let sh = NSShadow()
    sh.shadowColor = NSColor(calibratedWhite: 0, alpha: 0.55)
    sh.shadowBlurRadius = 3
    sh.shadowOffset = NSSize(width: 0, height: -1)
    shadowObj = sh
  }
  let emojiFont = NSFont(name: "Apple Color Emoji", size: font.pointSize) ?? font
  let ns = text as NSString
  let mas = NSMutableAttributedString()
  var i = 0
  while i < ns.length {
    let range = ns.rangeOfComposedCharacterSequence(at: i)
    let ch = ns.substring(with: range)
    let emoji = ch.unicodeScalars.contains(where: isEmojiScalar)
    var attrs: [NSAttributedString.Key: Any] = [
      .font: emoji ? emojiFont : font,
      .foregroundColor: color,
      .paragraphStyle: paragraph,
      .kern: tracking
    ]
    if let shadowObj { attrs[.shadow] = shadowObj }
    if stroke && !emoji {
      attrs[.strokeColor] = NSColor(calibratedWhite: 0, alpha: 0.55)
      attrs[.strokeWidth] = -3.0
    }
    mas.append(NSAttributedString(string: ch, attributes: attrs))
    i = range.location + range.length
  }
  return mas
}

for img in payload.images ?? [] {
  guard FileManager.default.fileExists(atPath: img.path),
        let nsImg = NSImage(contentsOfFile: img.path) else { continue }
  let srcSize = nsImg.size
  let srcH = max(1, srcSize.height)
  let targetW = max(8, CGFloat(img.scale) * CGFloat(width))
  let targetH = targetW * (srcH / max(1, srcSize.width))
  let cx = CGFloat(img.x) * CGFloat(width)
  let cyFromTop = CGFloat(img.y) * CGFloat(height)
  let rect = NSRect(
    x: cx - targetW / 2,
    y: CGFloat(height) - cyFromTop - targetH / 2,
    width: targetW,
    height: targetH
  )
  nsImg.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1)
}

for item in payload.items ?? [] {
  let raw = item.text.replacingOccurrences(of: "\n", with: " ")
    .replacingOccurrences(of: "\r", with: " ")
    .trimmingCharacters(in: .whitespacesAndNewlines)
  if raw.isEmpty { continue }
  let maxW = CGFloat(item.boxW ?? 0.88) * CGFloat(width)
  var fontSize = CGFloat(max(14, item.size))
  let trackingEm = CGFloat(item.tracking ?? 0)
  let fg = color(from: item.color)
  let wantStroke = item.stroke ?? true
  let wantShadow = item.shadow ?? true

  func make(_ size: CGFloat) -> NSAttributedString {
    let font = pickFont(name: item.font, path: item.fontPath, size: size, weight: item.weight)
    return buildAttr(
      text: raw,
      font: font,
      color: fg,
      tracking: trackingEm * size,
      stroke: wantStroke,
      shadow: wantShadow
    )
  }

  var attr = make(fontSize)
  var size = attr.size()
  if size.width > maxW && size.width > 0 {
    fontSize = max(12, fontSize * (maxW / size.width))
    attr = make(fontSize)
    size = attr.size()
  }
  let cx = CGFloat(item.x) * CGFloat(width)
  let cyFromTop = CGFloat(item.y) * CGFloat(height)
  let x = cx - size.width / 2
  let y = CGFloat(height) - cyFromTop - size.height / 2
  attr.draw(at: NSPoint(x: x, y: y))
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
