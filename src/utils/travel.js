// travel.js — ArcTravelEscrow read/write utilities
import { APP_URL } from '../config.js'
import { getPublicClient, getWalletClient } from './wallet.js'
import { ARCTRAVEL_ESCROW_ADDRESS, USDC_ADDRESS, USDC_DECIMALS } from '../config.js'
import ABI from '../abis/ArcTravelEscrow.json'
import ERC20_ABI from '../abis/ERC20.json'
import { parseUnits, formatUnits, keccak256, toBytes, decodeEventLog } from 'viem'

function client() { return getPublicClient() }

export const TRAVEL_STATUS_LABEL = ['Active', 'Tranche Paid', 'Cancelled', 'Cancelled — Missed Payment', 'Released to Merchant']
export const TRAVEL_STATUS_COLOR = ['var(--green)', 'var(--usdc)', 'var(--yellow)', 'var(--red)', 'var(--text3)']

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function toUsdc(human) {
  return parseUnits(String(human), USDC_DECIMALS)
}

export function fromUsdc(raw) {
  try { return parseFloat(formatUnits(BigInt(raw.toString()), USDC_DECIMALS)) }
  catch { return parseFloat(raw) || 0 }
}

export function addMinutes(mins) {
  return Math.floor(Date.now() / 1000) + mins * 60
}

export function addDays(days) {
  return Math.floor(Date.now() / 1000) + days * 86400
}

export function toDatetimeLocal(unix) {
  const d = new Date(unix * 1000)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocal(str) {
  return Math.floor(new Date(str).getTime() / 1000)
}

export function computeTravelMetadataHash(agencyName, description, note, travelRef) {
  const encoded = `${agencyName}|${description}|${note}|${travelRef}`
  return keccak256(toBytes(encoded))
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function fetchTravelBooking(travelId) {
  try {
    const t = await client().readContract({
      address: ARCTRAVEL_ESCROW_ADDRESS,
      abi: ABI,
      functionName: 'getTravelBooking',
      args: [BigInt(travelId)],
    })
    return parseTravelBooking(t)
  } catch { return null }
}

export async function fetchMerchantTravelIds(merchant) {
  try {
    return await client().readContract({
      address: ARCTRAVEL_ESCROW_ADDRESS,
      abi: ABI,
      functionName: 'getMerchantTravelBookings',
      args: [merchant],
    })
  } catch { return [] }
}

export async function fetchCustomerTravelIds(customer) {
  try {
    return await client().readContract({
      address: ARCTRAVEL_ESCROW_ADDRESS,
      abi: ABI,
      functionName: 'getCustomerTravelBookings',
      args: [customer],
    })
  } catch { return [] }
}

export async function totalTravelBookings() {
  try {
    const n = await client().readContract({
      address: ARCTRAVEL_ESCROW_ADDRESS,
      abi: ABI,
      functionName: 'totalTravelBookings',
    })
    return Number(n)
  } catch { return 0 }
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function approveTravelUsdc(account, amountHuman) {
  const wc = getWalletClient()
  const amount = toUsdc(amountHuman)
  const hash = await wc.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [ARCTRAVEL_ESCROW_ADDRESS, amount],
    account,
  })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

export async function executeCreateTravelBooking({ account, merchant, totalPackageAmount, initialPaymentAmount, nonRefundableBps, trancheAmount, paymentDueDate, paymentDeadline, cancellationDeadline, travelStartDate, travelRef, description, metadataHash }) {
  const wc = getWalletClient()
  const hash = await wc.writeContract({
    address: ARCTRAVEL_ESCROW_ADDRESS,
    abi: ABI,
    functionName: 'createTravelBooking',
    args: [
      merchant,
      toUsdc(totalPackageAmount),
      toUsdc(initialPaymentAmount),
      BigInt(nonRefundableBps),
      toUsdc(trancheAmount),
      BigInt(paymentDueDate),
      BigInt(paymentDeadline),
      BigInt(cancellationDeadline),
      BigInt(travelStartDate),
      travelRef,
      description || '',
      metadataHash,
    ],
    account,
  })
  const receipt = await client().waitForTransactionReceipt({ hash })
  // Extract travelId from the TravelBookingCreated event, ignoring ERC20 Transfer logs.
  let travelId = null
  for (const log of receipt.logs || []) {
    try {
      const decoded = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics, eventName: 'TravelBookingCreated' })
      if (decoded.eventName === 'TravelBookingCreated') {
        travelId = Number(decoded.args.travelId)
        break
      }
    } catch {}
  }
  if (travelId === null) throw new Error('TravelBookingCreated event not found')
  return { hash, travelId }
}

export async function executeRequestTranche(account, travelId) {
  const wc = getWalletClient()
  const hash = await wc.writeContract({
    address: ARCTRAVEL_ESCROW_ADDRESS,
    abi: ABI,
    functionName: 'requestTranchePayment',
    args: [BigInt(travelId)],
    account,
  })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

export async function executePayTranche(account, travelId, trancheAmount) {
  const wc = getWalletClient()
  // Approve first
  await approveTravelUsdc(account, trancheAmount)
  const hash = await wc.writeContract({
    address: ARCTRAVEL_ESCROW_ADDRESS,
    abi: ABI,
    functionName: 'payTranche',
    args: [BigInt(travelId)],
    account,
  })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

export async function executeCancelBeforeDeadline(account, travelId) {
  const wc = getWalletClient()
  const hash = await wc.writeContract({
    address: ARCTRAVEL_ESCROW_ADDRESS,
    abi: ABI,
    functionName: 'cancelBeforeDeadline',
    args: [BigInt(travelId)],
    account,
  })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

export async function executeCancelForMissedPayment(account, travelId) {
  const wc = getWalletClient()
  const hash = await wc.writeContract({
    address: ARCTRAVEL_ESCROW_ADDRESS,
    abi: ABI,
    functionName: 'cancelForMissedPayment',
    args: [BigInt(travelId)],
    account,
  })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

export async function executeReleaseAfterDeadline(account, travelId) {
  const wc = getWalletClient()
  const hash = await wc.writeContract({
    address: ARCTRAVEL_ESCROW_ADDRESS,
    abi: ABI,
    functionName: 'releaseAfterCancellationDeadline',
    args: [BigInt(travelId)],
    account,
  })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseTravelBooking(t) {
  if (!t || !t.travelId) return null
  return {
    travelId:              Number(t.travelId),
    customer:              t.customer,
    merchant:              t.merchant,
    totalPackageAmount:    t.totalPackageAmount,
    initialPaymentAmount:  t.initialPaymentAmount,
    nonRefundableAmount:   t.nonRefundableAmount,
    refundableEscrowAmount: t.refundableEscrowAmount,
    nonRefundableBps:      Number(t.nonRefundableBps),
    trancheAmount:         t.trancheAmount,
    paymentDueDate:        Number(t.paymentDueDate),
    paymentDeadline:       Number(t.paymentDeadline),
    cancellationDeadline:  Number(t.cancellationDeadline),
    travelStartDate:       Number(t.travelStartDate),
    travelRef:             t.travelRef,
    description:           t.description || '',
    metadataHash:          t.metadataHash,
    trancheRequested:      t.trancheRequested,
    tranchePaid:           t.tranchePaid,
    tranchePaidAt:         Number(t.tranchePaidAt),
    status:                Number(t.status),
    createdAt:             Number(t.createdAt),
    closedAt:              Number(t.closedAt),
    createdBlock:          Number(t.createdBlock),
  }
}

// ─── localStorage request helpers ─────────────────────────────────────────────

const TRAVEL_REQUESTS_KEY = 'arcpay_travel_requests'

export function saveTravelRequest(req) {
  const existing = getTravelRequests()
  existing.unshift(req)
  localStorage.setItem(TRAVEL_REQUESTS_KEY, JSON.stringify(existing.slice(0, 50)))
}

export function getTravelRequests() {
  try { return JSON.parse(localStorage.getItem(TRAVEL_REQUESTS_KEY) || '[]') }
  catch { return [] }
}

export function encodeTravelRequest(req) {
  return btoa(JSON.stringify(req))
}

export function decodeTravelRequest(encoded) {
  try { return JSON.parse(atob(encoded)) }
  catch { return null }
}

export function buildTravelUrl(req) {
  const encoded = encodeTravelRequest(req)
  const base = APP_URL
  return `${base}/travel/pay?r=${encoded}`
}

export function cacheTravelTxHash(travelId, hash) {
  const key = `arcpay_travel_tx_${travelId}`
  localStorage.setItem(key, hash)
}

export function getCachedTravelTxHash(travelId) {
  return localStorage.getItem(`arcpay_travel_tx_${travelId}`) || null
}
