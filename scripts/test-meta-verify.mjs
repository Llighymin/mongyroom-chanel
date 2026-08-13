/**
 * .env 기반 Meta 계정 검증 테스트
 * 사용: node scripts/test-meta-verify.mjs
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dir, '..')

function loadEnv() {
  const raw = readFileSync(resolve(root, '.env'), 'utf8')
  const out = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\w+)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

const GRAPH_FB = 'https://graph.facebook.com/v21.0'
const GRAPH_IG = 'https://graph.instagram.com/v21.0'

async function graph(base, path, token, params = {}) {
  const url = new URL(`${base}${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, body }
}

function redactToken(t) {
  if (!t || t.length < 12) return '(empty)'
  return `${t.slice(0, 8)}…${t.slice(-4)} (${t.length} chars)`
}

const env = loadEnv()
const igUserId = env.userid || env.ig_user_id || ''
let token = (env.access_token || env.token || '').replace(/^Bearer\s+/i, '').replace(/\s+/g, '')

console.log('=== .env Meta 검증 테스트 ===\n')
console.log('IG User ID:', igUserId || '(없음)')
console.log('Token:', redactToken(token))
console.log('Token type:', token.startsWith('IG') ? 'Instagram Login (IGAA)' : 'Facebook/Page (EAAG 등)')
console.log('')

if (!token) {
  console.error('access_token이 .env에 없습니다.')
  process.exit(1)
}

// Instagram Login 검증 (앱 로직과 동일)
if (token.startsWith('IG')) {
  console.log('--- Instagram Login 검증 (graph.instagram.com) ---')
  const me = await graph(GRAPH_IG, '/me', token, { fields: 'id,username,user_id' })
  console.log('/me', me.status, me.ok ? 'OK' : 'FAIL')
  console.log(JSON.stringify(me.body, null, 2))

  if (me.ok && me.body?.user_id) {
    const uid = String(me.body.user_id)
    const limit = await graph(GRAPH_IG, `/${uid}/content_publishing_limit`, token)
    console.log('\ncontent_publishing_limit', limit.status, limit.ok ? 'OK' : 'FAIL')
    console.log(JSON.stringify(limit.body, null, 2))

    const idMatch = !igUserId || igUserId === uid
    console.log('\n✓ 검증 결과:', me.ok && limit.ok && idMatch ? '성공' : '실패')
    if (me.body.username) console.log(`  계정: @${me.body.username}`)
    console.log(`  IG User ID: ${uid}`)
    if (igUserId && igUserId !== uid) {
      console.log(`  ⚠ .env userid(${igUserId})와 토큰 user_id(${uid}) 불일치`)
    }
  } else {
    console.log('\n✗ 검증 실패')
  }
} else {
  console.log('--- Facebook Graph 검증 (graph.facebook.com) ---')
  const id = igUserId || 'me'
  const r = await graph(GRAPH_FB, `/${id}`, token, { fields: 'id,username,name' })
  console.log(`GET /${id}`, r.status, r.ok ? 'OK' : 'FAIL')
  console.log(JSON.stringify(r.body, null, 2))
  console.log('\n', r.ok ? '✓ 검증 성공' : '✗ 검증 실패')
}

// Facebook Graph에 IGAA 토큰 넣으면 실패하는지 참고용
if (token.startsWith('IG')) {
  console.log('\n--- 참고: graph.facebook.com에 IGAA 토큰 (기존 오류 원인) ---')
  const bad = await graph(GRAPH_FB, `/${igUserId || 'me'}`, token, { fields: 'id,username' })
  console.log('HTTP', bad.status, bad.body?.error?.message || '')
}
