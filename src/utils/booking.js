import { parseUnits, formatUnits, keccak256, toHex, decodeEventLog } from 'viem'
import { ARCBOOKING_ADDRESS, USDC_ADDRESS, USDC_DECIMALS, ARCSCAN_BASE, APP_URL } from '../config.js'
import ArcBookingEscrowABI from '../abis/ArcBookingEscrow.json'
import ERC20ABI            from '../abis/ERC20.json'
import { getPublicClient, getWalletClient } from './wallet.js'
import { cacheBookingTxHash } from './bookingRequest.js'

export const BOOKING_STATUS = { Active: 0, CancelledBeforeDeadline: 1, ReleasedToMerchant: 2 }
export const BOOKING_STATUS_LABEL = ['Active', 'Cancelled', 'Released to Hotel']
export const BOOKING_STATUS_COLOR = ['#22d47e', '#f0c040', '#7b88a8']

export function formatUsdc(raw) {
  return parseFloat(formatUnits(raw, USDC_DECIMALS)).toFixed(2)
}

export function formatUsdcFull(raw) {
  return parseFloat(formatUnits(raw, USDC_DECIMALS)).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 6, useGrouping: false,
  })
}

export function formatTs(unix) {
  if (!unix || unix === 0n) return '—'
  return new Date(Number(unix) * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

export function formatDeadlineCountdown(unixDeadline) {
  const now  = Math.floor(Date.now() / 1000)
  const diff = Number(unixDeadline) - now
  if (diff <= 0) return 'Deadline passed'
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h remaining`
  if (h > 0)  return `${h}h ${m}m remaining`
  return `${m}m ${s}s remaining`
}

export function computeBookingMetadataHash(merchantName, description, note, bookingRef, checkInDate, cancellationDeadline) {
  const text = `${merchantName||''}|${description||''}|${note||''}|${bookingRef||''}|${checkInDate||''}|${cancellationDeadline||''}`
  if (!text.replace(/\|/g, '').trim()) return '0x' + '0'.repeat(64)
  return keccak256(toHex(text))
}

export async function approveUsdcForBooking(account, amountHuman) {
  const pc  = getPublicClient()
  const wc  = getWalletClient()
  const amt = parseUnits(amountHuman.toString(), USDC_DECIMALS)
  const { request } = await pc.simulateContract({
    address: USDC_ADDRESS, abi: ERC20ABI,
    functionName: 'approve', args: [ARCBOOKING_ADDRESS, amt], account,
  })
  const tx = await wc.writeContract(request)
  await pc.waitForTransactionReceipt({ hash: tx })
  return tx
}

export async function executeCreateBooking({
  account, merchant, totalAmountHuman, nonRefundableBps,
  cancellationDeadline, checkInDate, bookingRef, description, metadataHash,
}) {
  const pc  = getPublicClient()
  const wc  = getWalletClient()
  const amt = parseUnits(totalAmountHuman.toString(), USDC_DECIMALS)

  const { request } = await pc.simulateContract({
    address: ARCBOOKING_ADDRESS, abi: ArcBookingEscrowABI,
    functionName: 'createBookingPayment',
    args: [
      merchant, amt, BigInt(nonRefundableBps),
      BigInt(cancellationDeadline), BigInt(checkInDate),
      bookingRef, description || '', metadataHash,
    ],
    account,
  })
  const txHash  = await wc.writeContract(request)
  const receipt = await pc.waitForTransactionReceipt({ hash: txHash })

  let bookingId = null
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: ArcBookingEscrowABI, data: log.data, topics: log.topics, eventName: 'BookingCreated' })
      if (decoded.eventName === 'BookingCreated') {
        bookingId = Number(decoded.args.bookingId)
        break
      }
    } catch {}
  }
  if (bookingId === null) throw new Error('BookingCreated event not found')
  cacheBookingTxHash(bookingId, txHash)
  return { txHash, bookingId }
}

export async function executeCancelBeforeDeadline(account, bookingId) {
  const pc = getPublicClient()
  const wc = getWalletClient()
  const { request } = await pc.simulateContract({
    address: ARCBOOKING_ADDRESS, abi: ArcBookingEscrowABI,
    functionName: 'cancelBeforeDeadline', args: [BigInt(bookingId)], account,
  })
  const txHash = await wc.writeContract(request)
  await pc.waitForTransactionReceipt({ hash: txHash })
  return txHash
}

export async function executeReleaseAfterDeadline(account, bookingId) {
  const pc = getPublicClient()
  const wc = getWalletClient()
  const { request } = await pc.simulateContract({
    address: ARCBOOKING_ADDRESS, abi: ArcBookingEscrowABI,
    functionName: 'releaseAfterDeadline', args: [BigInt(bookingId)], account,
  })
  const txHash = await wc.writeContract(request)
  await pc.waitForTransactionReceipt({ hash: txHash })
  return txHash
}

export async function fetchBooking(bookingId) {
  const pc = getPublicClient()
  const exists = await pc.readContract({
    address: ARCBOOKING_ADDRESS, abi: ArcBookingEscrowABI,
    functionName: 'bookingExists', args: [BigInt(bookingId)],
  })
  if (!exists) return null
  return await pc.readContract({
    address: ARCBOOKING_ADDRESS, abi: ArcBookingEscrowABI,
    functionName: 'getBooking', args: [BigInt(bookingId)],
  })
}

export async function fetchMerchantBookingIds(merchant) {
  const pc = getPublicClient()
  return await pc.readContract({
    address: ARCBOOKING_ADDRESS, abi: ArcBookingEscrowABI,
    functionName: 'getMerchantBookings', args: [merchant],
  })
}

export async function fetchGuestBookingIds(guest) {
  const pc = getPublicClient()
  return await pc.readContract({
    address: ARCBOOKING_ADDRESS, abi: ArcBookingEscrowABI,
    functionName: 'getGuestBookings', args: [guest],
  })
}

export function buildBookingReceiptObject({ booking, txHash, bookingId, merchantName, description, merchantProfile }) {
  return {
    arcpay_version:       'v0.1-testnet',
    booking_id:           bookingId.toString(),
    type:                 'Booking Receipt',
    status:               BOOKING_STATUS_LABEL[booking.status] || 'Unknown',
    merchant_wallet:      booking.merchant,
    merchant_name:        merchantProfile?.tradingName || merchantName || '—',
    merchant_legal_name:  merchantProfile?.legalName || '—',
    merchant_country:     merchantProfile?.country || '—',
    merchant_address:     merchantProfile?.businessAddress || '—',
    merchant_vat:         merchantProfile?.vatOrCompanyId || '—',
    merchant_lei:         merchantProfile?.lei || '—',
    guest_wallet:         booking.guest,
    total_amount:         formatUsdcFull(booking.totalAmount),
    non_refundable_amount: formatUsdcFull(booking.nonRefundableAmount),
    refundable_amount:    formatUsdcFull(booking.refundableAmount),
    non_refundable_bps:   booking.nonRefundableBps.toString(),
    non_refundable_pct:   `${(Number(booking.nonRefundableBps) / 100).toFixed(0)}%`,
    cancellation_deadline: formatTs(booking.cancellationDeadline),
    check_in_date:        formatTs(booking.checkInDate),
    booking_ref:          booking.bookingRef,
    description:          booking.description || description || '',
    metadata_hash:        booking.metadataHash,
    created_at:           formatTs(booking.createdAt),
    closed_at:            booking.closedAt && booking.closedAt > 0n ? formatTs(booking.closedAt) : '—',
    created_block:        booking.createdBlock?.toString(),
    transaction_hash:     txHash || null,
    arcscan_link:         txHash ? `${ARCSCAN_BASE}/tx/${txHash}` : `${ARCSCAN_BASE}/address/${booking.merchant}`,
    booking_page:         `${APP_URL}/booking/${bookingId}`,
    network:              'Arc Testnet (Chain ID: 5042002)',
    contract_address:     ARCBOOKING_ADDRESS,
    disclaimer:           'TESTNET ONLY. Not a regulated escrow or travel booking service. Testnet tokens have no real economic value.',
  }
}
