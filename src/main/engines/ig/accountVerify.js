import { getSecret } from '../secrets.js'
import { GRAPH, graphErrorMessage, graphJson } from './graph.js'

/** 숫자형 Meta/IG ID */
export function isNumericId(v) {
  return /^\d{5,30}$/.test(String(v || '').trim())
}

/**
 * 계정 입력값 정규화·검증.
 * 업로드에 필수: ig_user_id(또는 page_id로 조회 가능) + access_token
 */
export function normalizeMetaAccountInput(data = {}, { requireToken = true } = {}) {
  const label = String(data.label || '').trim() || '인스타 계정'
  const ig_user_id = String(data.ig_user_id || '').trim()
  const page_id = String(data.page_id || '').trim()
  const token = String(data.token || '').trim()

  const errors = []
  if (requireToken && !token) {
    errors.push('액세스 토큰을 입력해 주세요.')
  }
  if (!ig_user_id && !page_id) {
    errors.push('인스타그램 사용자 ID 또는 페이스북 페이지 ID가 필요해요.')
  }
  if (ig_user_id && !isNumericId(ig_user_id)) {
    errors.push('인스타그램 사용자 ID는 숫자여야 해요. (@핸들이나 페이지 ID가 아니에요.)')
  }
  if (page_id && !isNumericId(page_id)) {
    errors.push('페이스북 페이지 ID는 숫자여야 해요.')
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { label, ig_user_id, page_id, token }
  }
}

/** 페이지에 연결된 IG 비즈니스 계정 ID 조회 */
export async function resolveIgUserIdFromPage(pageId, token) {
  const url = new URL(`${GRAPH}/${pageId}`)
  url.searchParams.set('fields', 'instagram_business_account{id,username}')
  url.searchParams.set('access_token', token)
  const { res, body } = await graphJson(url.toString())
  if (!res.ok) {
    throw new Error(graphErrorMessage(body, '페이지 정보를 읽지 못했어요.'))
  }
  const igId = body?.instagram_business_account?.id
  if (!igId) {
    throw new Error('이 페이지에 연결된 인스타그램 비즈니스 계정이 없어요.')
  }
  return {
    ig_user_id: String(igId),
    username: body.instagram_business_account.username || ''
  }
}

/** 앱 ID/시크릿이 있으면 단기 토큰을 장기 토큰으로 교환 */
export async function maybeExchangeLongLivedToken(shortToken) {
  const appId = getSecret('meta_app_id')
  const appSecret = getSecret('meta_app_secret')
  if (!appId || !appSecret || !shortToken) {
    return { token: shortToken, exchanged: false }
  }
  const url = new URL(`${GRAPH}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('fb_exchange_token', shortToken)

  const { res, body } = await graphJson(url.toString())
  if (!res.ok || !body.access_token) {
    // 이미 장기 토큰이거나 교환 불필요면 원본 유지
    return { token: shortToken, exchanged: false, warning: graphErrorMessage(body, '') || null }
  }
  return {
    token: body.access_token,
    exchanged: true,
    expires_in: body.expires_in || null
  }
}

/**
 * 업로드 가능 여부 검증:
 * - 토큰으로 IG 계정 조회
 * - (선택) 페이지 ↔ IG 연결 확인
 * - (선택) debug_token으로 권한 힌트
 */
export async function verifyMetaUploadCredentials({
  ig_user_id = '',
  page_id = '',
  token = ''
}) {
  const normalized = normalizeMetaAccountInput(
    { label: 'tmp', ig_user_id, page_id, token },
    { requireToken: true }
  )
  if (!normalized.ok) {
    return { ok: false, message: normalized.errors[0], ...normalized.value }
  }

  let igUserId = normalized.value.ig_user_id
  let pageId = normalized.value.page_id
  let accessToken = normalized.value.token
  let username = ''
  let exchanged = false

  try {
    const exchangedRes = await maybeExchangeLongLivedToken(accessToken)
    accessToken = exchangedRes.token
    exchanged = !!exchangedRes.exchanged
  } catch {
    /* 교환 실패해도 원본 토큰으로 계속 */
  }

  if (!igUserId && pageId) {
    const resolved = await resolveIgUserIdFromPage(pageId, accessToken)
    igUserId = resolved.ig_user_id
    username = resolved.username
  }

  // IG 계정 확인
  const igUrl = new URL(`${GRAPH}/${igUserId}`)
  igUrl.searchParams.set('fields', 'id,username,name')
  igUrl.searchParams.set('access_token', accessToken)
  const { res: igRes, body: igBody } = await graphJson(igUrl.toString())
  if (!igRes.ok || !igBody?.id) {
    return {
      ok: false,
      message: graphErrorMessage(igBody, '인스타그램 계정을 확인하지 못했어요. IG User ID와 토큰을 확인해 주세요.'),
      ig_user_id: igUserId,
      page_id: pageId
    }
  }
  username = igBody.username || username || ''

  // 페이지가 있으면 IG 연결 일치 확인
  if (pageId) {
    try {
      const linked = await resolveIgUserIdFromPage(pageId, accessToken)
      if (String(linked.ig_user_id) !== String(igUserId)) {
        return {
          ok: false,
          message: `페이지에 연결된 IG 계정(${linked.ig_user_id})과 입력한 IG ID(${igUserId})가 달라요.`,
          ig_user_id: igUserId,
          page_id: pageId,
          username
        }
      }
    } catch (e) {
      return {
        ok: false,
        message: e.message || '페이지와 인스타그램 연결을 확인하지 못했어요.',
        ig_user_id: igUserId,
        page_id: pageId,
        username
      }
    }
  }

  // 권한 힌트 (앱 ID/시크릿이 있을 때만)
  let permissions = []
  let permissionWarning = ''
  try {
    const appId = getSecret('meta_app_id')
    const appSecret = getSecret('meta_app_secret')
    if (appId && appSecret) {
      const dbg = new URL(`${GRAPH}/debug_token`)
      dbg.searchParams.set('input_token', accessToken)
      dbg.searchParams.set('access_token', `${appId}|${appSecret}`)
      const { res: dRes, body: dBody } = await graphJson(dbg.toString())
      if (dRes.ok && dBody?.data) {
        permissions = dBody.data.scopes || []
        if (
          permissions.length &&
          !permissions.includes('instagram_content_publish') &&
          !permissions.includes('instagram_basic')
        ) {
          permissionWarning =
            '토큰에 릴스 게시 권한(instagram_content_publish)이 안 보일 수 있어요. 게시는 가능해도 실패할 수 있습니다.'
        }
      }
    }
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    message: username
      ? `@${username} 계정 연결이 확인됐어요.${exchanged ? ' (장기 토큰으로 변환됨)' : ''}`
      : `인스타그램 계정 연결이 확인됐어요.${exchanged ? ' (장기 토큰으로 변환됨)' : ''}`,
    ig_user_id: String(igBody.id),
    page_id: pageId,
    username,
    token: accessToken,
    exchanged,
    permissions,
    permissionWarning
  }
}
