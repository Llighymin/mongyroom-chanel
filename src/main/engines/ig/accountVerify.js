import { getSecret } from '../../secrets.js'
import {
  GRAPH,
  GRAPH_IG,
  graphApiMode,
  graphErrorMessage,
  graphJson,
  isInstagramLoginToken
} from './graph.js'

/** 숫자형 Meta/IG ID */
export function isNumericId(v) {
  return /^\d{5,30}$/.test(String(v || '').trim())
}

/** 토큰 문자열 정규화 (Bearer 접두사·따옴표·공백 제거) */
export function normalizeAccessToken(raw) {
  let token = String(raw || '').trim()
  if (/^bearer\s+/i.test(token)) token = token.replace(/^bearer\s+/i, '')
  token = token.replace(/^["']|["']$/g, '')
  token = token.replace(/\s+/g, '')
  return token
}

/**
 * 계정 입력값 정규화·검증.
 * 업로드에 필수: ig_user_id(또는 page_id로 조회 가능) + access_token
 */
export function normalizeMetaAccountInput(data = {}, { requireToken = true } = {}) {
  const label = String(data.label || '').trim() || '인스타 계정'
  const ig_user_id = String(data.ig_user_id || '').trim()
  const page_id = String(data.page_id || '').trim()
  const token = normalizeAccessToken(data.token)

  const errors = []
  if (requireToken && !token) {
    errors.push('액세스 토큰을 입력해 주세요.')
  }
  if (!ig_user_id && !page_id && !isInstagramLoginToken(token)) {
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
    console.warn('[meta-verify] page lookup failed', { pageId, error: body?.error })
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

/**
 * 입력 ID가 페이지 ID인지 확인하고, 페이지면 연결된 IG ID를 반환한다.
 */
async function probePageLinkedIg(id, token) {
  const url = new URL(`${GRAPH}/${id}`)
  url.searchParams.set('fields', 'instagram_business_account{id,username}')
  url.searchParams.set('access_token', token)
  const { res, body } = await graphJson(url.toString())
  if (!res.ok || !body?.instagram_business_account?.id) return null
  return {
    page_id: String(id),
    ig_user_id: String(body.instagram_business_account.id),
    username: body.instagram_business_account.username || ''
  }
}

/**
 * 사용자 토큰으로 /me/accounts를 조회해 페이지 액세스 토큰·IG ID를 맞춘다.
 * 릴스 업로드는 페이지 토큰이 필요한 경우가 많다.
 */
export async function resolvePageCredentials({ pageId = '', igUserId = '', token }) {
  const url = new URL(`${GRAPH}/me/accounts`)
  url.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}')
  url.searchParams.set('limit', '100')
  url.searchParams.set('access_token', token)
  const { res, body } = await graphJson(url.toString())

  if (!res.ok) {
    console.warn('[meta-verify] /me/accounts failed', { error: body?.error })
    return {
      token,
      page_id: pageId,
      ig_user_id: igUserId,
      username: '',
      pageTokenResolved: false
    }
  }

  const pages = body?.data || []
  if (!pages.length) {
    return {
      token,
      page_id: pageId,
      ig_user_id: igUserId,
      username: '',
      pageTokenResolved: false
    }
  }

  let match = null
  if (pageId) {
    match = pages.find((p) => String(p.id) === String(pageId))
  }
  if (!match && igUserId) {
    match = pages.find(
      (p) => String(p.instagram_business_account?.id) === String(igUserId)
    )
  }
  if (!match && pages.length === 1 && pages[0].instagram_business_account?.id) {
    match = pages[0]
  }

  if (!match?.access_token) {
    return {
      token,
      page_id: pageId,
      ig_user_id: igUserId,
      username: '',
      pageTokenResolved: false
    }
  }

  const ig = match.instagram_business_account
  return {
    token: match.access_token,
    page_id: String(match.id),
    ig_user_id: ig?.id ? String(ig.id) : igUserId,
    username: ig?.username || '',
    pageTokenResolved: true
  }
}

/** Instagram Login(IGAA) 토큰 검증 — graph.instagram.com */
async function verifyInstagramLoginCredentials({ ig_user_id = '', token }) {
  const meUrl = new URL(`${GRAPH_IG}/me`)
  meUrl.searchParams.set('fields', 'id,username,user_id')
  meUrl.searchParams.set('access_token', token)
  const { res, body } = await graphJson(meUrl.toString())
  if (!res.ok || !body?.user_id) {
    console.warn('[meta-verify] instagram /me failed', { error: body?.error })
    return {
      ok: false,
      message: graphErrorMessage(body, 'Instagram 계정을 확인하지 못했어요. IGAA 토큰을 확인해 주세요.'),
      ig_user_id,
      page_id: ''
    }
  }

  const igUserId = String(body.user_id)
  const username = body.username || ''
  if (ig_user_id && String(ig_user_id) !== igUserId) {
    return {
      ok: false,
      message: `입력한 IG ID(${ig_user_id})와 토큰 계정(@${username}, ${igUserId})이 달라요.`,
      ig_user_id,
      page_id: ''
    }
  }

  const limitUrl = new URL(`${GRAPH_IG}/${igUserId}/content_publishing_limit`)
  limitUrl.searchParams.set('access_token', token)
  const { res: limitRes, body: limitBody } = await graphJson(limitUrl.toString())
  if (!limitRes.ok) {
    console.warn('[meta-verify] instagram publish limit failed', { error: limitBody?.error })
    return {
      ok: false,
      message: graphErrorMessage(
        limitBody,
        '릴스 게시 권한을 확인하지 못했어요. instagram_business_content_publish 권한이 있는지 확인해 주세요.'
      ),
      ig_user_id: igUserId,
      page_id: ''
    }
  }

  return {
    ok: true,
    message: `@${username} 계정 연결이 확인됐어요. (Instagram Login)`,
    ig_user_id: igUserId,
    page_id: '',
    username,
    token,
    api_mode: 'instagram_login',
    exchanged: false,
    pageTokenResolved: false,
    permissions: [],
    permissionWarning: ''
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
    console.warn('[meta-verify] token exchange skipped', { error: body?.error })
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
 * - 토큰 정규화·(선택) 장기 토큰 교환
 * - 페이지 ID ↔ IG ID 자동 판별
 * - /me/accounts로 페이지 액세스 토큰 확보
 * - IG 계정 조회 및 페이지 연결 확인
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

  if (isInstagramLoginToken(accessToken)) {
    return verifyInstagramLoginCredentials({ ig_user_id: igUserId, token: accessToken })
  }

  let username = ''
  let exchanged = false
  let pageTokenResolved = false

  try {
    const exchangedRes = await maybeExchangeLongLivedToken(accessToken)
    accessToken = exchangedRes.token
    exchanged = !!exchangedRes.exchanged
  } catch {
    /* 교환 실패해도 원본 토큰으로 계속 */
  }

  // IG ID 칸에 페이지 ID를 넣은 경우 자동 보정
  if (igUserId && !pageId) {
    const asPage = await probePageLinkedIg(igUserId, accessToken)
    if (asPage) {
      pageId = asPage.page_id
      igUserId = asPage.ig_user_id
      username = asPage.username
    }
  }

  if (!igUserId && pageId) {
    const resolved = await resolveIgUserIdFromPage(pageId, accessToken)
    igUserId = resolved.ig_user_id
    username = resolved.username
  }

  // 사용자 토큰 → 페이지 토큰으로 맞춤 (가능할 때)
  const pageCreds = await resolvePageCredentials({
    pageId,
    igUserId,
    token: accessToken
  })
  if (pageCreds.pageTokenResolved) {
    accessToken = pageCreds.token
    pageTokenResolved = true
    if (pageCreds.page_id) pageId = pageCreds.page_id
    if (pageCreds.ig_user_id) igUserId = pageCreds.ig_user_id
    if (pageCreds.username) username = pageCreds.username
  }

  if (!igUserId) {
    return {
      ok: false,
      message:
        '인스타그램 사용자 ID를 확인하지 못했어요. 페이지 ID를 입력하거나, Graph API 탐색기에서 IG User ID를 확인해 주세요.',
      ig_user_id: igUserId,
      page_id: pageId
    }
  }

  // IG 계정 확인
  const igUrl = new URL(`${GRAPH}/${igUserId}`)
  igUrl.searchParams.set('fields', 'id,username,name')
  igUrl.searchParams.set('access_token', accessToken)
  const { res: igRes, body: igBody } = await graphJson(igUrl.toString())
  if (!igRes.ok || !igBody?.id) {
    console.warn('[meta-verify] IG lookup failed', { igUserId, error: igBody?.error })
    return {
      ok: false,
      message: graphErrorMessage(
        igBody,
        '인스타그램 계정을 확인하지 못했어요. IG User ID와 페이지 액세스 토큰을 확인해 주세요.'
      ),
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
          message: `페이지에 연결된 IG 계정(@${linked.username || linked.ig_user_id})과 입력한 IG ID(${igUserId})가 달라요.`,
          ig_user_id: igUserId,
          page_id: pageId,
          username
        }
      }
      if (!username && linked.username) username = linked.username
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

  // 권한 힌트 (앱 ID/시크릿이 있을 때만, 실패해도 등록은 허용)
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

  if (!pageTokenResolved && !pageId) {
    permissionWarning = [
      permissionWarning,
      '페이지 ID 없이 등록했어요. 가능하면 페이지 ID를 함께 넣거나 Graph API 탐색기에서 페이지 액세스 토큰을 사용해 주세요.'
    ]
      .filter(Boolean)
      .join(' ')
  }

  const tokenNote = [
    exchanged ? '장기 토큰으로 변환됨' : '',
    pageTokenResolved ? '페이지 토큰으로 맞춤' : ''
  ]
    .filter(Boolean)
    .join(', ')

  return {
    ok: true,
    message: username
      ? `@${username} 계정 연결이 확인됐어요.${tokenNote ? ` (${tokenNote})` : ''}`
      : `인스타그램 계정 연결이 확인됐어요.${tokenNote ? ` (${tokenNote})` : ''}`,
    ig_user_id: String(igBody.id),
    page_id: pageId,
    username,
    token: accessToken,
    api_mode: graphApiMode(accessToken),
    exchanged,
    pageTokenResolved,
    permissions,
    permissionWarning
  }
}
