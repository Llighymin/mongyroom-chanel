import http from 'http'
import { spawn } from 'child_process'
import { createReadStream, existsSync, statSync } from 'fs'
import { extname } from 'path'
import localtunnel from 'localtunnel'

function mimeFor(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.webm') return 'video/webm'
  return 'application/octet-stream'
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })
}

/** cloudflared quick tunnel (설치되어 있으면 우선 사용) */
function tryCloudflared(port) {
  return new Promise((resolve) => {
    let settled = false
    const child = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }

    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      finish(null)
    }, 20000)

    const onData = (chunk) => {
      const m = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
      if (m) {
        finish({
          publicBase: m[0],
          closeTunnel: () => {
            try {
              child.kill()
            } catch {
              /* ignore */
            }
          }
        })
      }
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', () => finish(null))
    child.on('exit', () => finish(null))
  })
}

async function openTunnel(port) {
  const cf = await tryCloudflared(port)
  if (cf) return cf

  const tunnel = await localtunnel({ port })
  return {
    publicBase: tunnel.url.replace(/\/$/, ''),
    closeTunnel: () => tunnel.close()
  }
}

/**
 * 로컬 영상을 HTTPS 공개 URL로 잠깐 노출한다.
 * Instagram Login API는 Meta 서버가 video_url로 직접 받아가야 한다.
 */
export async function createPublicVideoUrl(videoPath) {
  if (!videoPath || !existsSync(videoPath)) {
    throw new Error('업로드할 영상 파일이 없어요.')
  }

  const stat = statSync(videoPath)
  const mime = mimeFor(videoPath)

  const server = http.createServer((req, res) => {
    if (!req.url?.startsWith('/video')) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    })
    createReadStream(videoPath).pipe(res)
  })

  await listen(server, 0)
  const port = server.address().port

  let tunnelCloser = null
  try {
    const tunnel = await openTunnel(port)
    tunnelCloser = tunnel.closeTunnel
    const publicUrl = `${tunnel.publicBase}/video`

    let closed = false
    return {
      url: publicUrl,
      async close() {
        if (closed) return
        closed = true
        try {
          tunnelCloser?.()
        } catch {
          /* ignore */
        }
        await new Promise((resolve) => server.close(resolve))
      }
    }
  } catch (e) {
    await new Promise((resolve) => server.close(resolve))
    throw new Error(
      '영상을 공개 URL로 노출하지 못했어요. 인터넷 연결을 확인하거나 Facebook 페이지 토큰(EAAG…)을 사용해 주세요.'
    )
  }
}
