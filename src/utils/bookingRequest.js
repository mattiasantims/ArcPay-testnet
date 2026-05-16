// Booking request encoding/decoding — Unicode-safe base64url
// URL format: /booking/pay?r=<base64url-JSON>

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

export function encodeBookingRequest(req) {
  const json = JSON.stringify({
    merchant:             req.merchant,
    merchantName:         req.merchantName         || '',
    totalAmount:          req.totalAmount,
    nonRefundableBps:     req.nonRefundableBps,
    bookingRef:           req.bookingRef,
    cancellationDeadline: req.cancellationDeadline,
    checkInDate:          req.checkInDate,
    description:          req.description          || '',
    note:                 req.note                 || '',
  })
  return toBase64url(json)
}

export function decodeBookingRequest(encoded) {
  try { return JSON.parse(fromBase64url(encoded)) }
  catch { return null }
}

export function buildBookingUrl(req) {
  const encoded = encodeBookingRequest(req)
  const base    = APP_URL
  return `${base}/booking/pay?r=${encoded}`
}

// localStorage helpers
const LS_KEY    = 'arcpay_booking_requests'
const TX_KEY    = 'arcpay_booking_tx_cache'

export function saveBookingRequest(req) {
  try {
    const list = getBookingRequests()
    const idx  = list.findIndex(r => r.bookingRef === req.bookingRef)
    if (idx >= 0) list[idx] = req
    else list.unshift(req)
    localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 200)))
  } catch {}
}

export function getBookingRequests() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') }
  catch { return [] }
}

export function cacheBookingTxHash(bookingId, txHash) {
  try {
    const cache = JSON.parse(localStorage.getItem(TX_KEY) || '{}')
    cache[bookingId.toString()] = txHash
    localStorage.setItem(TX_KEY, JSON.stringify(cache))
  } catch {}
}

export function getCachedBookingTxHash(bookingId) {
  try { return JSON.parse(localStorage.getItem(TX_KEY) || '{}')[bookingId.toString()] || null }
  catch { return null }
}
