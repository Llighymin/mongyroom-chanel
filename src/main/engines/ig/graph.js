const GRAPH_FB = 'https://graph.facebook.com/v21.0'
const GRAPH_IG = 'https://graph.instagram.com/v21.0'
const RUPLOAD = 'https://rupload.facebook.com/ig-api-upload/v21.0'

/** @deprecated facebook graph — graphBaseForToken() 사용 권장 */
const GRAPH = GRAPH_FB

export { GRAPH, GRAPH_FB, GRAPH_IG, RUPLOAD }

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Instagram Login 토큰 (IGAA…) vs Facebook/Page 토큰 (EAAG…) */
export function isInstagramLoginToken(token) {
  return /^IG/i.test(String(token || '').trim())
}

export function graphBaseForToken(token) {
  return isInstagramLoginToken(token) ? GRAPH_IG : GRAPH_FB
}

export function graphApiMode(token) {
  return isInstagramLoginToken(token) ? 'instagram_login' : 'facebook_login'
}

/** Meta Graph API 오류를 사용자 친화 메시지로 변환 */
export function graphErrorMessage(body, fallback) {
  const err = body?.error || {}
  const msg = err.error_user_msg || err.message || fallback || '요청에 실패했어요.'
  const code = err.code
  const subcode = err.error_subcode

  if (code === 190 || code === 102 || subcode === 463 || subcode === 467) {
    if (/parse|malformed|cannot parse/i.test(msg)) {
      if (/^IG/i.test(String(body?._tokenHint || ''))) {
        return 'Instagram Login(IGAA) 토큰은 graph.instagram.com 전용입니다. 앱이 자동으로 맞춥니다 — 그래도 실패하면 토큰을 다시 발급해 주세요.'
      }
      return '액세스 토큰 형식이 올바르지 않아요. "Bearer " 없이 EAAG… 또는 IGAA… 값만 붙여넣어 주세요.'
    }
    if (/expired|session has expired|session has been invalidated/i.test(msg)) {
      return '액세스 토큰이 만료됐어요. Meta에서 새 토큰을 발급해 주세요.'
    }
    return '액세스 토큰이 만료되었거나 올바르지 않아요. Instagram Login(IGAA) 또는 Facebook 페이지(EAAG) 토큰인지 확인해 주세요.'
  }

  if (code === 10 || code === 200 || /does not have permission|OAuthException/i.test(msg)) {
    return '인스타그램 게시 권한이 없어요. instagram_business_content_publish 또는 instagram_content_publish 권한을 확인해 주세요.'
  }

  if (code === 100) {
    if (/video_url is required/i.test(msg)) {
      return 'Instagram Login(IGAA) 토큰은 video_url 방식만 지원해요. 앱이 영상 공개 URL을 만들어 전송합니다.'
    }
    if (/instagram_business_account/i.test(msg)) {
      return '페이지 ID를 IG 사용자 ID 칸에 넣으신 것 같아요. 페이지 ID는 아래 칸에 넣거나 비워 두세요.'
    }
    if (/nonexisting field/i.test(msg)) {
      return '입력한 ID 종류가 맞지 않아요. IG User ID(1784…로 시작)와 페이지 ID를 구분해 주세요.'
    }
  }

  if (code === 803 || /Unsupported get request/i.test(msg)) {
    return '입력한 ID를 찾지 못했어요. IG User ID·페이지 ID·토큰이 같은 Meta 앱/계정에 속하는지 확인해 주세요.'
  }

  return msg
}

export async function graphJson(url, init) {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  return { res, body }
}
