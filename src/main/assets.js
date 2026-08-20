import { app, dialog, BrowserWindow } from 'electron'
import { copyFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { basename, extname, join, normalize, relative } from 'path'
import { randomBytes } from 'crypto'

export function assetsRoot(workspaceId) {
  return join(app.getPath('userData'), 'assets', String(workspaceId))
}

export function assetUrlFor(workspaceId, filename, cacheKey) {
  const base = `studio-media://asset/${workspaceId}/${filename}`
  if (cacheKey == null || cacheKey === '') return base
  return `${base}?v=${encodeURIComponent(String(cacheKey))}`
}

export function resolveAssetPath(workspaceId, filename) {
  if (!filename) return null
  const root = normalize(assetsRoot(workspaceId))
  const filePath = normalize(join(root, basename(filename)))
  const rel = relative(root, filePath)
  if (!rel || rel.startsWith('..')) return null
  return existsSync(filePath) ? filePath : null
}

export function overlayPreviewMap(workspaceId, images) {
  const out = {}
  if (!workspaceId || !Array.isArray(images)) return out
  for (const im of images) {
    if (!im?.id) continue
    const resolved = resolveWatermarkImagePath(workspaceId, im)
    if (!resolved) continue
    const fname = basename(resolved)
    try {
      out[im.id] = assetUrlFor(workspaceId, fname, String(statSync(resolved).mtimeMs))
    } catch {
      out[im.id] = assetUrlFor(workspaceId, fname)
    }
  }
  return out
}

export async function pickAndStoreImage(workspaceId, { title } = {}) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  const res = await dialog.showOpenDialog(win || undefined, {
    title: title || '이미지 선택',
    properties: ['openFile'],
    filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })
  if (res.canceled || !res.filePaths?.[0]) return null

  const src = res.filePaths[0]
  const dir = assetsRoot(workspaceId)
  mkdirSync(dir, { recursive: true })
  const ext = (extname(src) || '.png').toLowerCase()
  const filename = `${Date.now()}-${randomBytes(3).toString('hex')}${ext}`
  const dest = join(dir, filename)
  copyFileSync(src, dest)
  const mtime = String(statSync(dest).mtimeMs)
  return {
    path: dest,
    name: basename(src),
    filename,
    url: assetUrlFor(workspaceId, filename, mtime)
  }
}

/**
 * 워터마크 이미지 실제 경로 찾기.
 * 절대경로가 깨져도 채널 assets/{wsId}/{image_file}에서 복구한다.
 */
export function resolveWatermarkImagePath(workspaceId, watermark) {
  if (!watermark) return null
  const abs = String(watermark.image_path || '')
  if (abs && existsSync(abs)) return abs
  const file =
    basename(String(watermark.image_file || '')) ||
    (abs ? basename(abs) : '')
  if (!file || !workspaceId) return null
  return resolveAssetPath(workspaceId, file)
}
