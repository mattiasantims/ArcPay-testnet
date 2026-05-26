import { formatUnits } from 'viem'
import { USDC_DECIMALS } from '../config.js'
import { getPaymentRequests } from './paymentRequest.js'
import { getBookingRequests } from './bookingRequest.js'
import { getTravelRequests } from './travel.js'

// ─── Payment mode classification ─────────────────────────────────────────────

const LUXURY_REF_PREFIXES = ['LUX', 'BOUTIQUE', 'QA', 'TEMPSHOP', 'PRIVATE']
const LUXURY_REF_EXACT    = ['RETAIL']
const TRAVEL_REF_PREFIXES = ['TRAVEL', 'TRIP', 'TOUR', 'AGENCY']

export function classifyPaymentMode(proof, localReq) {
  // 1. Explicit paymentMode saved in localStorage
  if (localReq?.paymentMode === 'luxury')  return 'luxury'
  if (localReq?.paymentMode === 'online')  return 'online'
  if (localReq?.paymentMode === 'travel' || localReq?.paymentMode === 'travel_full') return 'travel'
  if (localReq?.paymentMode === 'standard') return 'standard'

  // 2. Purpose code + ref prefix heuristic
  const ref     = (proof?.paymentRef || localReq?.ref || '').toUpperCase()
  const purpose = (proof?.purposeCode || localReq?.purpose || '').toUpperCase()

  if (TRAVEL_REF_PREFIXES.some(p => ref.startsWith(p))) return 'travel'
  if (LUXURY_REF_PREFIXES.some(p => ref.startsWith(p))) return 'luxury'
  if (purpose === 'RETAIL' && LUXURY_REF_EXACT.some(p => ref.includes(p))) return 'luxury'
  if (['SERVICE', 'INVOICE', 'B2B', 'DONATION', 'OTHER'].includes(purpose)) return 'online'
  if (purpose === 'RETAIL') return 'luxury'

  return 'standard'
}

// ─── Time filter helpers ──────────────────────────────────────────────────────

export function getTimeFilterStart(filter) {
  const now = new Date()
  switch (filter) {
    case 'today':   return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    case '7d':      return new Date(Date.now() - 7  * 86400000)
    case '30d':     return new Date(Date.now() - 30 * 86400000)
    case 'mtd':     return new Date(now.getFullYear(), now.getMonth(), 1)
    case 'qtd': {
      const q = Math.floor(now.getMonth() / 3)
      return new Date(now.getFullYear(), q * 3, 1)
    }
    case 'ytd':     return new Date(now.getFullYear(), 0, 1)
    case 'all':
    default:        return new Date(0)
  }
}

export const TIME_FILTER_LABELS = {
  today: 'Today',
  '7d':  'Last 7 days',
  '30d': 'Last 30 days',
  mtd:   'Month to date',
  qtd:   'Quarter to date',
  ytd:   'Year to date',
  all:   'All time',
}

// ─── Core analytics computation ───────────────────────────────────────────────

export function toFloat(raw) {
  if (raw === undefined || raw === null) return 0
  try { return parseFloat(formatUnits(BigInt(raw.toString()), USDC_DECIMALS)) }
  catch { return parseFloat(raw) || 0 }
}

function tsToDate(ts) {
  if (!ts) return null
  const n = Number(ts)
  return n > 1e10 ? new Date(n) : new Date(n * 1000)
}

export function computeAnalytics({ receipts = [], bookings = [], travelBookings = [], commitments = [], refunds = [], payouts = [], timeFilter }) {
  const start       = getTimeFilterStart(timeFilter)
  const localReqs   = getPaymentRequests()
  const localBReqs  = getBookingRequests()
  const localTReqs  = getTravelRequests()
  const now         = Math.floor(Date.now() / 1000)

  // ── Filter receipts by time ──
  const filteredReceipts = receipts.filter(({ proof }) => {
    const d = tsToDate(proof?.timestamp)
    return d && d >= start
  })

  // ── Classify each receipt ──
  const classifiedReceipts = filteredReceipts.map(({ id, proof, txHash }) => {
    const localReq = localReqs.find(r => r.id === proof?.paymentRef || r.ref === proof?.paymentRef)
    const mode     = classifyPaymentMode(proof, localReq)
    const amount   = toFloat(proof?.amount)
    const ts       = tsToDate(proof?.timestamp)
    return { id, proof, txHash, localReq, mode, amount, ts }
  })

  const luxuryReceipts = classifiedReceipts.filter(r => r.mode === 'luxury')
  const travelReceipts = classifiedReceipts.filter(r => r.mode === 'travel')
  const onlineReceipts = classifiedReceipts.filter(r => r.mode === 'online' || r.mode === 'standard')

  // ── Filter bookings by time ──
  const filteredBookings = bookings.filter(({ booking }) => {
    const d = tsToDate(booking?.createdAt)
    return d && d >= start
  })

  const enrichedBookings = filteredBookings.map(({ id, booking }) => {
    const localReq   = localBReqs.find(r => r.bookingRef === booking?.bookingRef)
    const total      = toFloat(booking?.totalAmount)
    const nonRef     = toFloat(booking?.nonRefundableAmount)
    const refundable = toFloat(booking?.refundableAmount)
    const status     = Number(booking?.status ?? 0)
    const deadline   = Number(booking?.cancellationDeadline ?? 0)
    const isActive   = status === 0
    const isCancelled  = status === 1
    const isReleased   = status === 2
    const isUpcoming   = isActive && now < deadline
    const isReleasable = isActive && now >= deadline
    return { id, booking, localReq, total, nonRef, refundable, status, deadline, isActive, isCancelled, isReleased, isUpcoming, isReleasable }
  })

  // ── Travel scheduled payment metrics ──
  const filteredTravelBookings = travelBookings.filter(({ travel }) => {
    const d = tsToDate(travel?.createdAt)
    return d && d >= start
  })

  const enrichedTravelBookings = filteredTravelBookings.map(({ id, travel }) => {
    const localReq = localTReqs.find(r => r.travelRef === travel?.travelRef)
    const status = Number(travel?.status ?? 0)
    const totalPackage = toFloat(travel?.totalPackageAmount)
    const initial = toFloat(travel?.initialPaymentAmount)
    const nonRef = toFloat(travel?.nonRefundableAmount)
    const escrow = toFloat(travel?.refundableEscrowAmount)
    const tranche = toFloat(travel?.trancheAmount)
    const isActive = status === 0
    const isTranchePaid = status === 1 || travel?.tranchePaid
    const isCancelled = status === 2
    const isMissed = status === 3
    const isReleased = status === 4
    const readyToRequest = isActive && !travel?.trancheRequested && !travel?.tranchePaid && now >= Number(travel?.paymentDueDate || 0) && now < Number(travel?.paymentDeadline || 0)
    const awaitingPayment = isActive && travel?.trancheRequested && !travel?.tranchePaid && now <= Number(travel?.paymentDeadline || 0)
    const overdue = isActive && !travel?.tranchePaid && now > Number(travel?.paymentDeadline || 0)
    const upcoming = isActive && !travel?.tranchePaid && now < Number(travel?.paymentDueDate || 0)
    const releasable = (isActive || isTranchePaid) && now >= Number(travel?.cancellationDeadline || 0)
    return { id, travel, localReq, status, totalPackage, initial, nonRef, escrow, tranche, isActive, isTranchePaid, isCancelled, isMissed, isReleased, readyToRequest, awaitingPayment, overdue, upcoming, releasable }
  })

  const travelFullVolume = travelReceipts.reduce((s, r) => s + r.amount, 0)
  const travelFullCount = travelReceipts.length
  const travelScheduledCount = enrichedTravelBookings.length
  const travelPackageValue = travelFullVolume + enrichedTravelBookings.reduce((s, t) => s + t.totalPackage, 0)
  const travelInitialCollected = enrichedTravelBookings.reduce((s, t) => s + t.initial, 0)
  const travelNonRefRetained = enrichedTravelBookings.reduce((s, t) => s + t.nonRef, 0)
  const travelEscrowLocked = enrichedTravelBookings.filter(t => t.isActive || t.isTranchePaid).reduce((s, t) => s + t.escrow, 0)
  const travelTranchePaidAmount = enrichedTravelBookings.filter(t => t.isTranchePaid).reduce((s, t) => s + t.tranche, 0)
  const travelTrancheDueAmount = enrichedTravelBookings.filter(t => t.readyToRequest || t.awaitingPayment || t.overdue).reduce((s, t) => s + t.tranche, 0)
  const travelOverdueAmount = enrichedTravelBookings.filter(t => t.overdue).reduce((s, t) => s + t.tranche, 0)
  const travelRefundedToCustomers = enrichedTravelBookings.filter(t => t.isCancelled).reduce((s, t) => s + t.escrow, 0)
  const travelReleasedToMerchant = enrichedTravelBookings.filter(t => t.isReleased || t.isMissed).reduce((s, t) => s + t.escrow, 0)
  const travelActualVolume = travelFullVolume + travelInitialCollected + travelTranchePaidAmount
  const travelCount = travelFullCount + travelScheduledCount
  const travelActiveBookings = enrichedTravelBookings.filter(t => t.isActive)
  const travelTranchePaidBookings = enrichedTravelBookings.filter(t => t.isTranchePaid)
  const travelCancelledBookings = enrichedTravelBookings.filter(t => t.isCancelled)
  const travelMissedPaymentBookings = enrichedTravelBookings.filter(t => t.isMissed)
  const travelReleasedBookings = enrichedTravelBookings.filter(t => t.isReleased)
  const travelUpcoming = enrichedTravelBookings.filter(t => t.upcoming)
  const travelReadyToRequest = enrichedTravelBookings.filter(t => t.readyToRequest)
  const travelAwaitingPayment = enrichedTravelBookings.filter(t => t.awaitingPayment)
  const travelOverdue = enrichedTravelBookings.filter(t => t.overdue)
  const travelReleasable = enrichedTravelBookings.filter(t => t.releasable)

  // ── Overview metrics ──
  const totalReceiptAmount  = classifiedReceipts.reduce((s, r) => s + r.amount, 0)
  const totalBookingAmount  = enrichedBookings.reduce((s, b) => s + b.total, 0)
  const totalVolume         = totalReceiptAmount + totalBookingAmount + travelInitialCollected + travelTranchePaidAmount
  const totalCount          = classifiedReceipts.length + enrichedBookings.length + enrichedTravelBookings.length
  const uniquePayers        = new Set([
    ...classifiedReceipts.map(r => r.proof?.payer?.toLowerCase()).filter(Boolean),
    ...enrichedBookings.map(b => b.booking?.guest?.toLowerCase()).filter(Boolean),
    ...enrichedTravelBookings.map(t => t.travel?.customer?.toLowerCase()).filter(Boolean),
  ]).size

  const allAmounts = [...classifiedReceipts.map(r => r.amount), ...enrichedBookings.map(b => b.total), ...enrichedTravelBookings.map(t => t.initial)]
  const avgAmount  = allAmounts.length ? totalVolume / allAmounts.length : 0
  const maxAmount  = allAmounts.length ? Math.max(...allAmounts) : 0
  const sortedAmts = [...allAmounts].sort((a, b) => a - b)
  const medAmount  = sortedAmts.length ? sortedAmts[Math.floor(sortedAmts.length / 2)] : 0

  // ── Luxury metrics ──
  const luxuryVolume   = luxuryReceipts.reduce((s, r) => s + r.amount, 0)
  const luxuryCount    = luxuryReceipts.length
  const luxuryAvg      = luxuryCount ? luxuryVolume / luxuryCount : 0
  const luxuryMax      = luxuryCount ? Math.max(...luxuryReceipts.map(r => r.amount)) : 0
  const luxuryMin      = luxuryCount ? Math.min(...luxuryReceipts.map(r => r.amount)) : 0
  const luxuryPayers   = new Set(luxuryReceipts.map(r => r.proof?.payer?.toLowerCase()).filter(Boolean)).size
  const luxuryHighVal  = luxuryReceipts.filter(r => r.amount >= 500).length

  // ── Luxury commitment metrics (delayed + tranche) ──
  const now2 = Math.floor(Date.now() / 1000)

  const luxuryCommitments = commitments.filter(c => {
    const d = c.createdAt ? new Date(c.createdAt * 1000) : null
    return d && d >= start
  })

  // Delayed payments
  const luxuryDelayed         = luxuryCommitments.filter(c => c.type === 0)
  const luxuryDelayedActive   = luxuryDelayed.filter(c => c.status === 0)
  const luxuryDelayedFulfilled= luxuryDelayed.filter(c => c.status === 1)
  const luxuryDelayedCancelled= luxuryDelayed.filter(c => c.status === 2 || c.status === 3)
  const luxuryDelayedOverdue  = luxuryDelayedActive.filter(c => now2 >= (c.deadline || 0))
  const luxuryDelayedVolume   = luxuryDelayedFulfilled.reduce((s, c) => s + parseFloat(c.totalAmount || 0), 0)
  const luxuryDelayedPending  = luxuryDelayedActive.reduce((s, c) => s + parseFloat(c.totalAmount || 0), 0)

  // Tranche payments
  const luxuryTranche         = luxuryCommitments.filter(c => c.type === 1)
  const luxuryTrancheActive   = luxuryTranche.filter(c => c.status === 0)
  const luxuryTrancheFulfilled= luxuryTranche.filter(c => c.status === 1)
  const luxuryTrancheCancelled= luxuryTranche.filter(c => c.status === 2 || c.status === 3)
  const luxuryTrancheOverdue  = luxuryTrancheActive.filter(c => now2 >= (c.trancheDeadlines?.[c.tranchesPaidCount] || 0))
  // Paid tranche volume = sum of paid tranches across all tranche commitments
  const luxuryTranchePaid     = luxuryTranche.reduce((s, c) => {
    const paid = (c.trancheAmounts || []).reduce((ts, amt, i) => ts + (c.tranchePaid?.[i] ? parseFloat(amt || 0) : 0), 0)
    return s + paid
  }, 0)
  const luxuryTranchePending  = luxuryTrancheActive.reduce((s, c) => {
    const unpaid = (c.trancheAmounts || []).reduce((ts, amt, i) => ts + (!c.tranchePaid?.[i] ? parseFloat(amt || 0) : 0), 0)
    return s + unpaid
  }, 0)
  const luxuryTrancheProgress = luxuryTranche.reduce((s, c) => s + (c.tranchesPaidCount || 0), 0)
  const luxuryTrancheTotal    = luxuryTranche.reduce((s, c) => s + (c.trancheAmounts?.length || 0), 0)

  // Refunds
  const luxuryRefunds         = refunds.filter(r => {
    // Match refunds to luxury commitments by proofRef
    const isLuxury = luxuryCommitments.some(c => c.ref === r.proofRef) ||
                     luxuryReceipts.some(rx => (rx.proof?.paymentRef || rx.id) === r.proofRef)
    const d = r.requestedAt ? new Date(r.requestedAt * 1000) : (r.processedAt ? new Date(r.processedAt * 1000) : null)
    return isLuxury && (!d || d >= start)
  })
  const luxuryRefundRequested = luxuryRefunds.filter(r => r.status === 0)
  const luxuryRefundApproved  = luxuryRefunds.filter(r => r.status === 1 || r.status === 3)
  const luxuryRefundDenied    = luxuryRefunds.filter(r => r.status === 2)
  const luxuryRefundedVolume  = luxuryRefundApproved.reduce((s, r) => s + parseFloat(r.amount || 0), 0)
  const luxuryRefundPendingVol= luxuryRefundRequested.reduce((s, r) => s + parseFloat(r.amount || 0), 0)

  // Combined luxury total volume (instant paid + delayed fulfilled + tranche paid)
  const luxuryTotalVolume     = luxuryVolume + luxuryDelayedVolume + luxuryTranchePaid

  // ── Online metrics ──
  const onlineVolume   = onlineReceipts.reduce((s, r) => s + r.amount, 0)
  const onlineCount    = onlineReceipts.length
  const onlineAvg      = onlineCount ? onlineVolume / onlineCount : 0
  const onlineMax      = onlineCount ? Math.max(...onlineReceipts.map(r => r.amount)) : 0
  const onlinePayers   = new Set(onlineReceipts.map(r => r.proof?.payer?.toLowerCase()).filter(Boolean)).size
  const purposeCodes   = {}
  onlineReceipts.forEach(r => {
    const p = r.proof?.purposeCode || 'OTHER'
    purposeCodes[p] = (purposeCodes[p] || 0) + 1
  })

  // ── Booking metrics ──
  const bookingVolume     = enrichedBookings.reduce((s, b) => s + b.total, 0)
  const bookingCount      = enrichedBookings.length
  const bookingAvg        = bookingCount ? bookingVolume / bookingCount : 0
  const activeBookings    = enrichedBookings.filter(b => b.isActive)
  const cancelledBookings = enrichedBookings.filter(b => b.isCancelled)
  const releasedBookings  = enrichedBookings.filter(b => b.isReleased)
  const upcomingBookings  = enrichedBookings.filter(b => b.isUpcoming)
  const releasableBookings = enrichedBookings.filter(b => b.isReleasable)
  const escrowLocked      = activeBookings.reduce((s, b) => s + b.refundable, 0)
  const nonRefRetained    = enrichedBookings.reduce((s, b) => s + b.nonRef, 0)
  const refundedToGuests  = cancelledBookings.reduce((s, b) => s + b.refundable, 0)
  const releasedToHotel   = releasedBookings.reduce((s, b) => s + b.refundable, 0)
  const totalHotelReceived = nonRefRetained + releasedToHotel
  const cancellationRate  = bookingCount ? (cancelledBookings.length / bookingCount * 100).toFixed(1) : '0.0'
  const releaseRate       = bookingCount ? (releasedBookings.length / bookingCount * 100).toFixed(1) : '0.0'

  // ── Volume over time (daily buckets) ──
  function buildTimeSeries(items, getTs, getAmt) {
    // Items are already filtered by the selected time period above.
    // Do not apply an additional hard-coded 30-day cutoff here, otherwise
    // All-time / YTD / QTD charts would silently lose older data.
    const buckets = {}
    items.forEach(item => {
      const d = getTs(item)
      if (!d) return
      const key = d.toISOString().slice(0, 10)
      if (!buckets[key]) buckets[key] = { date: key, volume: 0, count: 0 }
      buckets[key].volume += getAmt(item)
      buckets[key].count  += 1
    })
    return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date))
  }

  const overviewTimeSeries  = buildTimeSeries(classifiedReceipts, r => r.ts, r => r.amount)
  const luxuryTimeSeries    = buildTimeSeries(luxuryReceipts,     r => r.ts, r => r.amount)
  const onlineTimeSeries    = buildTimeSeries(onlineReceipts,     r => r.ts, r => r.amount)
  const bookingTimeSeries   = buildTimeSeries(enrichedBookings,   b => tsToDate(b.booking?.createdAt), b => b.total)
  const travelTimeSeries    = buildTimeSeries([...travelReceipts, ...enrichedTravelBookings], item => item.ts || tsToDate(item.travel?.createdAt), item => item.amount ?? item.initial)

  // ── Payouts (outbound USDC) ──
  const enrichedPayouts = payouts.filter(p => {
    const d = tsToDate(p.createdAt)
    return d && d >= start
  }).map(p => {
    const amountNum = parseFloat(p.amountHuman ?? (Number(p.amount || 0) / 1e6)) || 0
    return { id: p.id, payout: p, amount: amountNum, ts: tsToDate(p.createdAt) }
  })
  const payoutsCount       = enrichedPayouts.length
  const payoutsVolume      = enrichedPayouts.reduce((s, p) => s + p.amount, 0)
  const payoutsAvg         = payoutsCount > 0 ? payoutsVolume / payoutsCount : 0
  const payoutsRecipients  = new Set(enrichedPayouts.map(p => p.payout.recipient?.toLowerCase())).size
  const payoutsBatchItems  = enrichedPayouts.filter(p => p.payout.batchRefHash && p.payout.batchRefHash !== '0x' + '0'.repeat(64)).length
  const payoutsSingleItems = payoutsCount - payoutsBatchItems
  // Purpose breakdown
  const payoutsByPurpose   = {}
  enrichedPayouts.forEach(p => {
    const k = p.payout.purposeCode || 'OTHER'
    payoutsByPurpose[k] = (payoutsByPurpose[k] || 0) + p.amount
  })
  const payoutsTimeSeries  = buildTimeSeries(enrichedPayouts, p => p.ts, p => p.amount)

  return {
    // overview
    totalVolume, totalCount, uniquePayers, avgAmount, medAmount, maxAmount,
    totalReceiptAmount, totalBookingAmount,
    // travel
    travelVolume: travelActualVolume, travelPackageValue, travelCount, travelFullVolume, travelFullCount,
    travelInitialCollected, travelNonRefRetained, travelEscrowLocked, travelTranchePaidAmount,
    travelTrancheDueAmount, travelOverdueAmount, travelRefundedToCustomers, travelReleasedToMerchant,
    travelActiveBookings, travelTranchePaidBookings, travelCancelledBookings, travelMissedPaymentBookings,
    travelReleasedBookings, travelUpcoming, travelReadyToRequest, travelAwaitingPayment, travelOverdue,
    travelReleasable, enrichedTravelBookings, travelReceipts,
    // luxury
    luxuryVolume, luxuryCount, luxuryAvg, luxuryMax, luxuryMin, luxuryPayers, luxuryHighVal,
    luxuryTotalVolume,
    luxuryDelayed, luxuryDelayedActive, luxuryDelayedFulfilled, luxuryDelayedCancelled,
    luxuryDelayedOverdue, luxuryDelayedVolume, luxuryDelayedPending,
    luxuryTranche, luxuryTrancheActive, luxuryTrancheFulfilled, luxuryTrancheCancelled,
    luxuryTrancheOverdue, luxuryTranchePaid, luxuryTranchePending,
    luxuryTrancheProgress, luxuryTrancheTotal,
    luxuryRefunds, luxuryRefundRequested, luxuryRefundApproved, luxuryRefundDenied,
    luxuryRefundedVolume, luxuryRefundPendingVol,
    luxuryReceipts,
    // online
    onlineVolume, onlineCount, onlineAvg, onlineMax, onlinePayers, purposeCodes,
    onlineReceipts,
    // booking
    bookingVolume, bookingCount, bookingAvg,
    activeBookings, cancelledBookings, releasedBookings,
    upcomingBookings, releasableBookings,
    escrowLocked, nonRefRetained, refundedToGuests, releasedToHotel,
    totalHotelReceived, cancellationRate, releaseRate,
    enrichedBookings,
    // payouts (outbound)
    payoutsVolume, payoutsCount, payoutsAvg, payoutsRecipients,
    payoutsBatchItems, payoutsSingleItems, payoutsByPurpose,
    enrichedPayouts,
    // time series
    overviewTimeSeries, luxuryTimeSeries, onlineTimeSeries, bookingTimeSeries, travelTimeSeries, payoutsTimeSeries,
  }
}

// ─── Ask ArcPay AI local engine ───────────────────────────────────────────────

export function generateAiAnswer(question, metrics, timeFilter) {
  const tf   = TIME_FILTER_LABELS[timeFilter] || 'all time'
  const fmt  = n => parseFloat(n).toFixed(2)
  const q    = question.toLowerCase()

  const noData = metrics.totalCount === 0

  if (noData) {
    return `No on-chain data found for the selected wallet and time period (${tf}). Create a payment or booking and refresh to see analytics.`
  }

  // Overview questions
  if (q.includes('summarize') && !q.includes('luxury') && !q.includes('online') && !q.includes('hotel') && !q.includes('travel') && !q.includes('payout')) {
    return `Over ${tf}: you processed ${metrics.totalCount} payment${metrics.totalCount !== 1 ? 's' : ''} totalling ${fmt(metrics.totalVolume)} USDC across ${metrics.uniquePayers} unique payer${metrics.uniquePayers !== 1 ? 's' : ''}. Average payment: ${fmt(metrics.avgAmount)} USDC. Largest: ${fmt(metrics.maxAmount)} USDC. Luxury Retail: ${fmt(metrics.luxuryVolume)} USDC (${metrics.luxuryCount} payments). Online: ${fmt(metrics.onlineVolume)} USDC (${metrics.onlineCount} payments). Hotel Bookings: ${fmt(metrics.bookingVolume)} USDC (${metrics.bookingCount} bookings). Travel Agency: ${fmt(metrics.travelVolume)} USDC (${metrics.travelCount} items). Outbound payouts: ${fmt(metrics.payoutsVolume)} USDC (${metrics.payoutsCount} payouts).`
  }
  if (q.includes('channel') && q.includes('best')) {
    const channels = [
      { name: 'Luxury Retail', vol: metrics.luxuryVolume },
      { name: 'Online Payments', vol: metrics.onlineVolume },
      { name: 'Hotel Booking', vol: metrics.bookingVolume },
      { name: 'Travel Agency', vol: metrics.travelVolume },
    ].sort((a, b) => b.vol - a.vol)
    return `Over ${tf}: ${channels[0].name} is the top channel with ${fmt(channels[0].vol)} USDC, followed by ${channels[1].name} (${fmt(channels[1].vol)} USDC), ${channels[2].name} (${fmt(channels[2].vol)} USDC), and ${channels[3].name} (${fmt(channels[3].vol)} USDC).`
  }
  if (q.includes('how much usdc') || q.includes('total received')) {
    return `Over ${tf}: total USDC received is ${fmt(metrics.totalVolume)} USDC across ${metrics.totalCount} transaction${metrics.totalCount !== 1 ? 's' : ''}.`
  }
  if (q.includes('average payment') || q.includes('average amount')) {
    return `Over ${tf}: average payment is ${fmt(metrics.avgAmount)} USDC. Median: ${fmt(metrics.medAmount)} USDC. Largest: ${fmt(metrics.maxAmount)} USDC.`
  }
  if (q.includes('unique customer') || q.includes('unique payer')) {
    return `Over ${tf}: ${metrics.uniquePayers} unique payer wallet${metrics.uniquePayers !== 1 ? 's' : ''} across all payment channels.`
  }

  // Luxury questions
  if (q.includes('luxury')) {
    if (metrics.luxuryCount === 0 && metrics.luxuryDelayed.length === 0 && metrics.luxuryTranche.length === 0) return `No Luxury Retail payments found for ${tf}.`
    if (q.includes('summarize') || q.includes('performing')) {
      return `Luxury Retail over ${tf}: ${fmt(metrics.luxuryTotalVolume)} USDC total. Instant: ${metrics.luxuryCount} payments (${fmt(metrics.luxuryVolume)} USDC). Delayed: ${metrics.luxuryDelayed.length} commitments — ${metrics.luxuryDelayedFulfilled.length} fulfilled (${fmt(metrics.luxuryDelayedVolume)} USDC), ${metrics.luxuryDelayedActive.length} active (${fmt(metrics.luxuryDelayedPending)} USDC pending). Tranche: ${metrics.luxuryTranche.length} commitments — ${fmt(metrics.luxuryTranchePaid)} USDC paid, ${fmt(metrics.luxuryTranchePending)} USDC pending. Refunds: ${metrics.luxuryRefunds.length} (${metrics.luxuryRefundApproved.length} approved, ${fmt(metrics.luxuryRefundedVolume)} USDC refunded).`
    }
    if (q.includes('delayed') || q.includes('commitment')) {
      return `Luxury Delayed Payments over ${tf}: ${metrics.luxuryDelayed.length} total. Active: ${metrics.luxuryDelayedActive.length} (${fmt(metrics.luxuryDelayedPending)} USDC pending). Fulfilled: ${metrics.luxuryDelayedFulfilled.length} (${fmt(metrics.luxuryDelayedVolume)} USDC). Overdue: ${metrics.luxuryDelayedOverdue.length}.`
    }
    if (q.includes('tranche')) {
      return `Luxury Tranche Payments over ${tf}: ${metrics.luxuryTranche.length} total. Progress: ${metrics.luxuryTrancheProgress}/${metrics.luxuryTrancheTotal} tranches paid. Paid: ${fmt(metrics.luxuryTranchePaid)} USDC. Pending: ${fmt(metrics.luxuryTranchePending)} USDC. Overdue: ${metrics.luxuryTrancheOverdue.length}.`
    }
    if (q.includes('refund')) {
      return `Luxury Refunds over ${tf}: ${metrics.luxuryRefunds.length} requests. Approved/Direct: ${metrics.luxuryRefundApproved.length} (${fmt(metrics.luxuryRefundedVolume)} USDC). Pending: ${metrics.luxuryRefundRequested.length} (${fmt(metrics.luxuryRefundPendingVol)} USDC). Denied: ${metrics.luxuryRefundDenied.length}.`
    }
    if (q.includes('average') || q.includes('ticket')) return `Luxury Retail average ticket over ${tf}: ${fmt(metrics.luxuryAvg)} USDC.`
    if (q.includes('largest') || q.includes('biggest')) return `Largest Luxury Retail sale over ${tf}: ${fmt(metrics.luxuryMax)} USDC.`
    if (q.includes('unique') || q.includes('buyer')) return `${metrics.luxuryPayers} unique buyer wallet${metrics.luxuryPayers !== 1 ? 's' : ''} used Luxury Retail over ${tf}.`
    if (q.includes('how much') || q.includes('generate')) return `Luxury Retail generated ${fmt(metrics.luxuryVolume)} USDC over ${tf} across ${metrics.luxuryCount} payment${metrics.luxuryCount !== 1 ? 's' : ''}.`
  }

  // Online questions
  if (q.includes('online') || q.includes('payment link')) {
    if (metrics.onlineCount === 0) return `No Online Payment link transactions found for ${tf}.`
    if (q.includes('summarize') || q.includes('performing')) {
      const topPurpose = Object.entries(metrics.purposeCodes).sort((a, b) => b[1] - a[1])[0]
      return `Online Payments over ${tf}: ${metrics.onlineCount} payment${metrics.onlineCount !== 1 ? 's' : ''} totalling ${fmt(metrics.onlineVolume)} USDC. Average: ${fmt(metrics.onlineAvg)} USDC. ${metrics.onlinePayers} unique payer${metrics.onlinePayers !== 1 ? 's' : ''}. Most common purpose: ${topPurpose ? topPurpose[0] : 'N/A'}.`
    }
    if (q.includes('purpose')) {
      const top = Object.entries(metrics.purposeCodes).sort((a, b) => b[1] - a[1])
      if (!top.length) return `No purpose code data available for ${tf}.`
      return `Most common purpose code over ${tf}: ${top[0][0]} (${top[0][1]} payment${top[0][1] !== 1 ? 's' : ''}). Full breakdown: ${top.map(([k, v]) => `${k}: ${v}`).join(', ')}.`
    }
    if (q.includes('how much') || q.includes('generate')) return `Online payment links generated ${fmt(metrics.onlineVolume)} USDC over ${tf}.`
    if (q.includes('customer') || q.includes('payer')) return `${metrics.onlinePayers} unique payer wallet${metrics.onlinePayers !== 1 ? 's' : ''} paid via online payment links over ${tf}.`
    if (q.includes('average')) return `Average online payment over ${tf}: ${fmt(metrics.onlineAvg)} USDC.`
  }


  // Travel questions
  if (q.includes('travel') || q.includes('tranche')) {
    if (metrics.travelCount === 0) return `No Travel Agency payments or scheduled bookings found for ${tf}.`
    if (q.includes('summarize') || q.includes('performing')) {
      return `Travel Agency over ${tf}: ${metrics.travelCount} item${metrics.travelCount !== 1 ? 's' : ''}, ${fmt(metrics.travelPackageValue)} USDC total package value and ${fmt(metrics.travelVolume)} USDC actually collected. Scheduled bookings: ${metrics.enrichedTravelBookings.length}. Tranches paid: ${metrics.travelTranchePaidBookings.length}. Ready to request: ${metrics.travelReadyToRequest.length}. Overdue: ${metrics.travelOverdue.length}. Escrow locked: ${fmt(metrics.travelEscrowLocked)} USDC.`
    }
    if (q.includes('due soon')) return `${metrics.travelUpcoming.length} travel tranche${metrics.travelUpcoming.length !== 1 ? 's' : ''} are upcoming. ${metrics.travelReadyToRequest.length} are ready to request.`
    if (q.includes('ready to request')) return `${metrics.travelReadyToRequest.length} travel tranche${metrics.travelReadyToRequest.length !== 1 ? 's' : ''} ready to request, totalling ${fmt(metrics.travelReadyToRequest.reduce((s, t) => s + t.tranche, 0))} USDC.`
    if (q.includes('overdue')) return `${metrics.travelOverdue.length} travel booking${metrics.travelOverdue.length !== 1 ? 's' : ''} overdue for tranche payment, totalling ${fmt(metrics.travelOverdueAmount)} USDC.`
    if (q.includes('locked') || q.includes('escrow')) return `Travel refundable escrow currently locked: ${fmt(metrics.travelEscrowLocked)} USDC.`
    if (q.includes('paid')) return `Travel tranche amount paid: ${fmt(metrics.travelTranchePaidAmount)} USDC across ${metrics.travelTranchePaidBookings.length} booking${metrics.travelTranchePaidBookings.length !== 1 ? 's' : ''}.`
  }

  // Hotel/booking questions
  if (q.includes('hotel') || q.includes('booking') || q.includes('escrow')) {
    if (metrics.bookingCount === 0) return `No Hotel Booking Deposits found for ${tf}.`
    if (q.includes('summarize') || q.includes('performing')) {
      return `Hotel Bookings over ${tf}: ${metrics.bookingCount} booking${metrics.bookingCount !== 1 ? 's' : ''} totalling ${fmt(metrics.bookingVolume)} USDC. Active: ${metrics.activeBookings.length}. Cancelled: ${metrics.cancelledBookings.length}. Released: ${metrics.releasedBookings.length}. Hotel received: ${fmt(metrics.totalHotelReceived)} USDC. Escrow locked: ${fmt(metrics.escrowLocked)} USDC.`
    }
    if (q.includes('active')) return `${metrics.activeBookings.length} active booking${metrics.activeBookings.length !== 1 ? 's' : ''} over ${tf}. ${metrics.upcomingBookings.length} before deadline, ${metrics.releasableBookings.length} ready to release.`
    if (q.includes('locked') || q.includes('escrow')) return `Refundable escrow currently locked: ${fmt(metrics.escrowLocked)} USDC across ${metrics.activeBookings.length} active booking${metrics.activeBookings.length !== 1 ? 's' : ''}.`
    if (q.includes('release') && !q.includes('releas')) return `${fmt(metrics.releasedToHotel)} USDC has been released to hotel after deadline across ${metrics.releasedBookings.length} booking${metrics.releasedBookings.length !== 1 ? 's' : ''}.`
    if (q.includes('ready to release')) return `${metrics.releasableBookings.length} booking${metrics.releasableBookings.length !== 1 ? 's' : ''} ready to release. Total: ${fmt(metrics.releasableBookings.reduce((s, b) => s + b.refundable, 0))} USDC.`
    if (q.includes('refund')) return `${fmt(metrics.refundedToGuests)} USDC refunded to guests across ${metrics.cancelledBookings.length} cancelled booking${metrics.cancelledBookings.length !== 1 ? 's' : ''}.`
    if (q.includes('retain') || q.includes('non-refundable')) return `Hotel retained ${fmt(metrics.nonRefRetained)} USDC as non-refundable deposits over ${tf}.`
    if (q.includes('action') || q.includes('today')) {
      const parts = []
      if (metrics.releasableBookings.length) parts.push(`${metrics.releasableBookings.length} booking${metrics.releasableBookings.length !== 1 ? 's' : ''} ready to release (${fmt(metrics.releasableBookings.reduce((s, b) => s + b.refundable, 0))} USDC)`)
      if (metrics.upcomingBookings.length) parts.push(`${metrics.upcomingBookings.length} booking${metrics.upcomingBookings.length !== 1 ? 's' : ''} approaching deadline`)
      return parts.length ? `Action needed: ${parts.join('; ')}.` : `No urgent actions — all bookings are being monitored.`
    }
  }

  // Payouts questions (outbound USDC)
  if (q.includes('payout') || q.includes('send') || q.includes('recipient') || q.includes('supplier') || q.includes('contractor')) {
    if (metrics.payoutsCount === 0) return `No Merchant Payouts found for ${tf}. Send your first USDC payout from Accept USDC → Send USDC Payouts.`
    if (q.includes('summarize') || q.includes('performing')) {
      return `Merchant Payouts over ${tf}: ${metrics.payoutsCount} payout${metrics.payoutsCount !== 1 ? 's' : ''} totalling ${fmt(metrics.payoutsVolume)} USDC to ${metrics.payoutsRecipients} unique recipient${metrics.payoutsRecipients !== 1 ? 's' : ''}. Single: ${metrics.payoutsSingleItems}. Batch items: ${metrics.payoutsBatchItems}. Average: ${fmt(metrics.payoutsAvg)} USDC.`
    }
    if (q.includes('how much') && (q.includes('send') || q.includes('sent') || q.includes('out'))) {
      return `Over ${tf}: you sent ${fmt(metrics.payoutsVolume)} USDC across ${metrics.payoutsCount} payout${metrics.payoutsCount !== 1 ? 's' : ''}.`
    }
    if (q.includes('average')) return `Average payout over ${tf}: ${fmt(metrics.payoutsAvg)} USDC.`
    if (q.includes('unique') || q.includes('recipient') || q.includes('how many') && q.includes('paid')) {
      return `${metrics.payoutsRecipients} unique recipient wallet${metrics.payoutsRecipients !== 1 ? 's' : ''} received USDC payouts over ${tf}.`
    }
    if (q.includes('batch')) {
      return `Batch payouts over ${tf}: ${metrics.payoutsBatchItems} batch item${metrics.payoutsBatchItems !== 1 ? 's' : ''} out of ${metrics.payoutsCount} total payouts.`
    }
    if (q.includes('purpose') || q.includes('dominates') || q.includes('category')) {
      const entries = Object.entries(metrics.payoutsByPurpose).sort((a, b) => b[1] - a[1])
      if (!entries.length) return `No purpose breakdown available for ${tf}.`
      const top = entries[0]
      const breakdown = entries.map(([k, v]) => `${k}: ${fmt(v)} USDC`).join(', ')
      return `Top payout purpose over ${tf}: ${top[0]} with ${fmt(top[1])} USDC. Full breakdown — ${breakdown}.`
    }
  }

  return `I found ${metrics.totalCount + metrics.bookingCount} transaction${(metrics.totalCount + metrics.bookingCount) !== 1 ? 's' : ''} totalling ${fmt(metrics.totalVolume + metrics.bookingVolume)} USDC over ${tf}. Ask a more specific question about Luxury Retail, Online Payments, Hotel Bookings, Travel Agency or Merchant Payouts for detailed insights.`
}
