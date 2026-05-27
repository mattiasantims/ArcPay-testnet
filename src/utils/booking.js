import { parseUnits, formatUnits, keccak256, toHex, decodeEventLog } from 'viem'
import { ARCBOOKING_ADDRESS, USDC_ADDRESS, USDC_DECIMALS, ARCSCAN_BASE, APP_URL } from '../config.js'
import ArcBookingEscrowABI from '../abis/ArcBookingEscrow.json'
import ERC20ABI            from '../abis/ERC20.json'
import { getPublicClient, getWalletClient } from './wallet.js'
import { cacheBookingTxHash, getCachedBookingTxHash } from './bookingRequest.js'

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
  cacheCancelBookingTxHash(bookingId, txHash)
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
  cacheReleaseBookingTxHash(bookingId, txHash)
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
    // TX hashes — populated externally by BookingDetailsPage/Dashboard after fetchBookingTxHashes
    create_tx_hash:       txHash || null,
    cancel_tx_hash:       null,
    release_tx_hash:      null,
  }
}

// ── Cancel/Release TX hash cache (localStorage for persistence across reloads) ──
const _CANCEL_CACHE_KEY  = 'arcpay_booking_cancel_tx_cache'
const _RELEASE_CACHE_KEY = 'arcpay_booking_release_tx_cache'

function _readCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} }
}
function _writeCache(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)) } catch {}
}

export function cacheCancelBookingTxHash(bookingId, hash) {
  const c = _readCache(_CANCEL_CACHE_KEY); c[String(bookingId)] = hash; _writeCache(_CANCEL_CACHE_KEY, c)
}
export function cacheReleaseBookingTxHash(bookingId, hash) {
  const c = _readCache(_RELEASE_CACHE_KEY); c[String(bookingId)] = hash; _writeCache(_RELEASE_CACHE_KEY, c)
}
export function getCachedCancelBookingTxHash(bookingId)    {
  return _readCache(_CANCEL_CACHE_KEY)[String(bookingId)] || null
}
export function getCachedReleaseBookingTxHash(bookingId)   {
  return _readCache(_RELEASE_CACHE_KEY)[String(bookingId)] || null
}

// ── On-chain TX hash recovery ─────────────────────────────────────────────────
const _BK_BLOCKS_PER_SEC = 2n
const _BK_SEARCH_WINDOW  = 600n

async function _estimateBookingBlock(unixTimestamp) {
  if (!unixTimestamp || unixTimestamp === 0) return null
  try {
    const pc     = getPublicClient()
    const latest = await pc.getBlock({ blockTag: 'latest' })
    const diff   = BigInt(Number(latest.timestamp) - unixTimestamp)
    const est    = latest.number - diff * _BK_BLOCKS_PER_SEC
    return est > 0n ? est : 1n
  } catch { return null }
}

async function _findBookingEventTxHash(eventName, bookingIdBigInt, timestamp, createdAt, cachedHash) {
  if (cachedHash) return cachedHash
  try {
    const pc = getPublicClient()
    let fromBlock, toBlock
    if (timestamp) {
      const est = await _estimateBookingBlock(timestamp)
      if (!est) return null
      fromBlock = est > _BK_SEARCH_WINDOW ? est - _BK_SEARCH_WINDOW : 1n
      toBlock   = est + _BK_SEARCH_WINDOW
    } else if (createdAt) {
      const fromEst = await _estimateBookingBlock(createdAt)
      const latest  = await pc.getBlock({ blockTag: 'latest' })
      fromBlock = fromEst && fromEst > 0n ? fromEst : 1n
      toBlock   = latest.number
    } else { return null }
    const eventAbi = ArcBookingEscrowABI.find(x => x.type === 'event' && x.name === eventName)
    if (!eventAbi) return null
    const logs = await pc.getLogs({ address: ARCBOOKING_ADDRESS, event: eventAbi, args: { bookingId: bookingIdBigInt }, fromBlock, toBlock })
    return logs.length > 0 ? logs[0].transactionHash : null
  } catch { return null }
}

export async function fetchBookingTxHashes(booking) {
  if (!booking) return { createHash: null, cancelHash: null, releaseHash: null }
  const id          = BigInt(booking.bookingId || booking.id || 0)
  const status      = Number(booking.status || 0)
  const createdBlock = booking.createdBlock ? BigInt(booking.createdBlock) : null
  const closedBlock  = booking.closedBlock  ? BigInt(booking.closedBlock)  : null
  console.log('[BK] id:', id.toString(), 'status:', status, 'createdBlock:', createdBlock?.toString(), 'closedBlock:', closedBlock?.toString(), 'cached:', getCachedBookingTxHash(id.toString()))

  const idHex = '0x' + id.toString(16).padStart(64, '0')

  // Scan a block (or a small range around it) for a tx matching idHex on ArcBooking
  async function scanBlock(blockNumber) {
    if (!blockNumber || blockNumber <= 0n) return null
    const pc = getPublicClient()
    // Try the exact block, then ±1 ±2 (some RPC return slightly different block numbers)
    const candidates = [blockNumber, blockNumber - 1n, blockNumber + 1n, blockNumber - 2n, blockNumber + 2n]
    for (const bn of candidates) {
      if (bn <= 0n) continue
      try {
        const block = await pc.getBlock({ blockNumber: bn })
        if (!block?.transactions?.length) continue
        for (const txHash of block.transactions) {
          try {
            const receipt = await pc.getTransactionReceipt({ hash: txHash })
            if (receipt?.to?.toLowerCase() !== ARCBOOKING_ADDRESS.toLowerCase()) continue
            for (const log of receipt.logs) {
              if (log.address?.toLowerCase() === ARCBOOKING_ADDRESS.toLowerCase()) {
                if (log.topics?.[1] === idHex) {
                  console.log('[BK] match found id=' + id + ' at block=' + bn + ' tx=' + txHash)
                  return txHash
                }
              }
            }
          } catch (e) {
            console.log('[BK] getTransactionReceipt error for tx=' + txHash, e?.message)
          }
        }
      } catch (e) {
        console.log('[BK] getBlock error for block=' + bn, e?.message)
      }
    }
    console.log('[BK] NO match found for id=' + id + ' near block=' + blockNumber)
    return null
  }

  const createHash  = getCachedBookingTxHash(id.toString())
    || (createdBlock ? await scanBlock(createdBlock) : null)

  const cancelHash  = status === 1
    ? (getCachedCancelBookingTxHash(id.toString()) || (closedBlock ? await scanBlock(closedBlock) : null))
    : null

  const releaseHash = status === 2
    ? (getCachedReleaseBookingTxHash(id.toString()) || (closedBlock ? await scanBlock(closedBlock) : null))
    : null

  return { createHash, cancelHash, releaseHash }
}
