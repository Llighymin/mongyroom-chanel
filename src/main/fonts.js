import { app, dialog, BrowserWindow } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  statSync
} from 'fs'
import { basename, extname, join, normalize, relative } from 'path'
import { randomBytes } from 'crypto'
import { fontMac } from '../shared/editOptions.js'

export function fontsRoot() {
  return join(app.getPath('userData'), 'fonts')
}

function metaPath() {
  return join(fontsRoot(), 'fonts.json')
}

function readMeta() {
  try {
    const raw = JSON.parse(readFileSync(metaPath(), 'utf8'))
    return Array.isArray(raw) ? raw.filter((f) => f?.id && f?.filename) : []
  } catch {
    return []
  }
}

function writeMeta(list) {
  mkdirSync(fontsRoot(), { recursive: true })
  writeFileSync(metaPath(), JSON.stringify(list, null, 2), 'utf8')
}

export function fontUrlFor(filename, cacheKey) {
  const base = `studio-media://font/${filename}`
  if (cacheKey == null || cacheKey === '') return base
  return `${base}?v=${encodeURIComponent(String(cacheKey))}`
}

export function resolveFontFilePath(filename) {
  if (!filename) return null
  const root = normalize(fontsRoot())
  const filePath = normalize(join(root, basename(filename)))
  const rel = relative(root, filePath)
  if (!rel || rel.startsWith('..')) return null
  return existsSync(filePath) ? filePath : null
}

function cssFamilyFor(id) {
  return `StudioFont_${String(id).replace(/[^a-zA-Z0-9]/g, '_')}`
}

export function listCustomFonts() {
  return readMeta()
    .map((f) => {
      const path = resolveFontFilePath(f.filename)
      if (!path) return null
      let mtime = ''
      try {
        mtime = String(statSync(path).mtimeMs)
      } catch {
        /* ignore */
      }
      const id = String(f.id)
      return {
        id,
        label: String(f.label || basename(f.filename, extname(f.filename))),
        filename: basename(f.filename),
        path,
        cssFamily: f.cssFamily || cssFamilyFor(id),
        url: fontUrlFor(basename(f.filename), mtime)
      }
    })
    .filter(Boolean)
}

export function fontFilePathForId(fontId) {
  if (!String(fontId || '').startsWith('cf:')) return ''
  return listCustomFonts().find((f) => f.id === fontId)?.path || ''
}

export function fontRenderSpec(fontId) {
  return {
    font: fontMac(fontId) || '',
    fontPath: fontFilePathForId(fontId)
  }
}

export async function registerCustomFont() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  const res = await dialog.showOpenDialog(win || undefined, {
    title: '폰트 파일 선택',
    properties: ['openFile'],
    filters: [{ name: '폰트', extensions: ['ttf', 'otf', 'ttc', 'otc', 'woff', 'woff2'] }]
  })
  if (res.canceled || !res.filePaths?.[0]) return null

  const src = res.filePaths[0]
  const dir = fontsRoot()
  mkdirSync(dir, { recursive: true })
  const ext = (extname(src) || '.ttf').toLowerCase()
  const id = `cf:${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
  const filename = `${id.replace(':', '_')}${ext}`
  const dest = join(dir, filename)
  copyFileSync(src, dest)

  const label = basename(src, extname(src))
  const entry = {
    id,
    label,
    filename,
    cssFamily: cssFamilyFor(id)
  }
  writeMeta([...readMeta().filter((f) => f.id !== id), entry])
  return listCustomFonts().find((f) => f.id === id) || { ...entry, path: dest, url: fontUrlFor(filename) }
}

export function removeCustomFont(id) {
  const list = readMeta()
  const found = list.find((f) => f.id === id)
  if (!found) return false
  const path = resolveFontFilePath(found.filename)
  if (path) {
    try {
      unlinkSync(path)
    } catch {
      /* ignore */
    }
  }
  writeMeta(list.filter((f) => f.id !== id))
  return true
}
