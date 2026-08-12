const GRAPH = 'https://graph.facebook.com/v21.0'
const RUPLOAD = 'https://rupload.facebook.com/ig-api-upload/v21.0'

export { GRAPH, RUPLOAD }

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export function graphErrorMessage(body, fallback) {
  const msg = body?.error?.error_user_msg || body?.error?.message || fallback
  if (/permission|OAuthException/i.test(msg)) {
    return '인스타그램 게시 권한이 없어요. 앱 검수와 액세스 토큰을 확인해 주세요.'
  }
  if (/token/i.test(msg)) return '액세스 토큰이 만료되었거나 올바르지 않아요.'
  return msg
}

export async function graphJson(url, init) {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  return { res, body }
}
