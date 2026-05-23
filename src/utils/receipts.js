// Payment request encoding/decoding via base64url
// URL format: /pay?r=<base64url-JSON>

// Unicode-safe base64url encoding using TextEncoder/TextDecoder
// Supports accents, apostrophes, emojis, and non-English characters

import { APP_URL } from '../config.js'

function toBase64url(str) {
  const bytes  = new TextEncoder().encode(str)
  const binary = Array.from(bytes, b => String.fromCharCode(b)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64url(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const padded  = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const binary  = atob(padded)
  const bytes   = Uint8Array.from(binary, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodePaymentRequest(req) {
  const payload = {
    merchant: req.merchant,
    amount:   req.amount,
    ref:      req.ref,
    purpose:  req.purpose,
    name:     req.name    || '',
    desc:     req.desc    || '',
    note:     req.note    || '',
  }
  // v2 — payment type fields
  if (req.type && req.type !== 'immediate') {
    payload.type = req.type
    if (req.type === 'delayed') {
      payload.dueDate  = req.dueDate
      payload.deadline = req.deadline
    } else if (req.type === 'tranche') {
      payload.tranches = req.tranches
    }
  }
  // v3 — refund claim flag (workaround for policy-not-persisting bug)
  // Encodes the merchant's intent so ReceiptPage can show the refund button
  // even when the on-chain registry policy hasn't been saved.
  if (req.allowRefundClaim) {
    payload.allowRefundClaim       = true
    payload.refundClaimWindowDays  = req.refundClaimWindowDays  ?? 14
    payload.refundClaimBps         = req.refundClaimBps         ?? 10000
  }
  return toBase64url(JSON.stringify(payload))
}

export function buildCommitmentUrl(req) {
  return buildPaymentUrl(req)
}

export function decodePaymentRequest(encoded) {
  try {
    return JSON.parse(fromBase64url(encoded))
  } catch {
    return null
  }
}

export function buildPaymentUrl(req) {
  const encoded = encodePaymentRequest(req)
  const base    = APP_URL
  return `${base}/pay?r=${encoded}`
}

export function buildQRUrl(req) {
  return buildPaymentUrl(req)
}

// localStorage helpers for merchant payment history
const LS_KEY = 'arcpay_requests'

export function savePaymentRequest(req) {
  try {
    const list = getPaymentRequests()
    const existing = list.findIndex(r => r.id === req.id)
    if (existing >= 0) list[existing] = req
    else list.unshift(req)
    localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 200)))
  } catch {}
}

export function getPaymentRequests() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]')
  } catch { return [] }
}

export function getPaymentRequestById(id) {
  return getPaymentRequests().find(r => r.id === id) || null
}

// txHash cache
const TX_KEY = 'arcpay_tx_cache'

export function cacheTxHash(proofId, txHash) {
  try {
    const cache = JSON.parse(localStorage.getItem(TX_KEY) || '{}')
    cache[proofId.toString()] = txHash
    localStorage.setItem(TX_KEY, JSON.stringify(cache))
  } catch {}
}

export function getCachedTxHash(proofId) {
  try {
    return JSON.parse(localStorage.getItem(TX_KEY) || '{}')[proofId.toString()] || null
  } catch { return null }
}

// Merchant profile
const PROFILE_KEY = 'arcpay_merchant_profile'

export function saveMerchantProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {}
}

export function getMerchantProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
  } catch { return null }
}
