import { safeStorage } from 'electron'
import { upsertSecretRow, getSecretRow, deleteSecretRow, listSecretKeys } from './db.js'

/**
 * 비밀 값(API 키·토큰)을 OS 키체인 기반 safeStorage로 암호화해 DB에 보관한다.
 * 평문은 메인 프로세스 안에서만 잠깐 다루고, 렌더러(화면)로는 절대 내보내지 않는다.
 */

export function setSecret(key, plain) {
  if (!plain) {
    deleteSecretRow(key)
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    // 암호화가 불가능한 환경이면 최소한 base64로만 저장 (경고 대상)
    upsertSecretRow(key, 'plain:' + Buffer.from(plain, 'utf8').toString('base64'))
    return
  }
  const enc = safeStorage.encryptString(plain)
  upsertSecretRow(key, 'enc:' + enc.toString('base64'))
}

export function getSecret(key) {
  const stored = getSecretRow(key)
  if (!stored) return null
  if (stored.startsWith('plain:')) {
    return Buffer.from(stored.slice(6), 'base64').toString('utf8')
  }
  if (stored.startsWith('enc:')) {
    if (!safeStorage.isEncryptionAvailable()) return null
    const buf = Buffer.from(stored.slice(4), 'base64')
    return safeStorage.decryptString(buf)
  }
  return null
}

export function clearSecret(key) {
  deleteSecretRow(key)
}

/** 어떤 키가 저장되어 있는지 여부만 반환 (값은 절대 반환하지 않음). */
export function hasSecret(key) {
  return listSecretKeys().includes(key)
}
