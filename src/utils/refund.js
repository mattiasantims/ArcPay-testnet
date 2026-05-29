import { decodeEventLog } from 'viem'
import { getWalletClient, getPublicClient } from './wallet.js'
import { ARC_REFUND_ADDRESS, USDC_ADDRESS, USDC_DECIMALS } from '../config.js'
import ABI   from '../abis/ArcRefund.json'
import ERC20 from '../abis/ERC20.json'
function client() { return getPublicClient() }

// ── Status labels ─────────────────────────────────────────────────────────────
export const REFUND_STATUS_LABEL = {
  0: 'Requested',
  1: 'Approved',
  2: 'Denied',
  3: 'Direct refund',
}
export const REFUND_STATUS_COLOR = {
  0: 'var(--yellow)',
  1: 'var(--green)',
  2: '#f08080',
  3: 'var(--green)',
}

export function normalizeRefundStatus(status) {
  if (typeof status === 'bigint') return Number(status)
  if (typeof status === 'number') return status
  const text = String(status ?? '').trim().toLowerCase()
  if (!text) return null
  if (text === '0' || text.includes('requested')) return 0
  if (text === '1' || text.includes('approved')) return 1
  if (text === '2' || text.includes('denied')) return 2
  if (text === '3' || text.includes('direct')) return 3
  return null
}

export function getRefundStatusLabel(status) {
  const s = normalizeRefundStatus(status)
  return s == null ? '—' : (REFUND_STATUS_LABEL[s] || '—')
}

export function getRefundStatusColor(status) {
  const s = normalizeRefundStatus(status)
  return s == null ? 'var(--text3)' : (REFUND_STATUS_COLOR[s] || 'var(--text3)')
}

export function isDirectRefund(status) { return normalizeRefundStatus(status) === 3 }
export function isApprovedRefund(status) { return normalizeRefundStatus(status) === 1 }
export function isDeniedRefund(status) { return normalizeRefundStatus(status) === 2 }
export function isRequestedRefund(status) { return normalizeRefundStatus(status) === 0 }

function toUsdc(amount) { return BigInt(Math.round(parseFloat(amount) * 1e6)) }
function fromUsdc(v)    { return (Number(v) / 1e6).toFixed(2) }

// ── Revert detection ──────────────────────────────────────────────────────────
async function waitAndCheck(hash, label = 'Transaction') {
  const receipt = await client().waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`${label} reverted on-chain. Check wallet and USDC balance.`)
  }
  return receipt
}

// ── TX hash cache (session-only, lost on page refresh) ────────────────────────
const _requestCache = new Map()  // refundId -> requestTxHash
const _processCache = new Map()  // refundId -> approve/deny/direct TxHash

export function cacheRefundRequestTx(refundId, hash)  { _requestCache.set(String(refundId), hash) }
export function cacheRefundProcessTx(refundId, hash)  { _processCache.set(String(refundId), hash) }
export function getCachedRefundRequestTx(refundId)    { return _requestCache.get(String(refundId)) || null }
export function getCachedRefundProcessTx(refundId)    { return _processCache.get(String(refundId)) || null }

// ── On-chain event log recovery ───────────────────────────────────────────────
// Arc Testnet: ~0.51 sec/block → ~2 blocks/sec
// We search ±600 blocks (~5 min window) around the estimated block
const BLOCKS_PER_SEC = 2n
const SEARCH_WINDOW  = 600n

async function estimateBlock(unixTimestamp) {
  if (!unixTimestamp || unixTimestamp === 0) return null
  try {
    const pc           = client()
    const latestBlock  = await pc.getBlock({ blockTag: 'latest' })
    const latestTs     = Number(latestBlock.timestamp)
    const latestNum    = latestBlock.number
    const diffSec      = BigInt(latestTs - unixTimestamp)
    const estimated    = latestNum - diffSec * BLOCKS_PER_SEC
    return estimated > 0n ? estimated : 1n
  } catch { return null }
}

async function findEventTxHash(eventName, refundIdBigInt, timestamp, requestedAt = null) {
  // 1. Try cache first
  const cached = eventName === 'RefundRequested'
    ? getCachedRefundRequestTx(refundIdBigInt.toString())
    : getCachedRefundProcessTx(refundIdBigInt.toString())
  if (cached) return cached

  // 2. Search on-chain logs
  try {
    let fromBlock, toBlock
    if (timestamp) {
      const estimatedBlock = await estimateBlock(timestamp)
      if (!estimatedBlock) return null
      fromBlock = estimatedBlock > SEARCH_WINDOW ? estimatedBlock - SEARCH_WINDOW : 1n
      toBlock   = estimatedBlock + SEARCH_WINDOW
    } else if (requestedAt) {
      // Wide search from requestedAt to now
      const fromEstimated = await estimateBlock(requestedAt)
      const pc = client()
      const latest = await pc.getBlock({ blockTag: 'latest' })
      fromBlock = fromEstimated && fromEstimated > 0n ? fromEstimated : 1n
      toBlock   = latest.number
    } else {
      return null
    }

    const pc      = client()
    const eventAbi = ABI.find(x => x.type === 'event' && x.name === eventName)
    if (!eventAbi) return null

    const logs = await pc.getLogs({
      address:   ARC_REFUND_ADDRESS,
      event:     eventAbi,
      args:      { refundId: refundIdBigInt },
      fromBlock,
      toBlock,
    })

    if (logs.length > 0) {
      const hash = logs[0].transactionHash
      // Cache the result
      if (eventName === 'RefundRequested') cacheRefundRequestTx(refundIdBigInt.toString(), hash)
      else cacheRefundProcessTx(refundIdBigInt.toString(), hash)
      return hash
    }
    return null
  } catch { return null }
}

// ── Main event fetcher ────────────────────────────────────────────────────────
// Returns { requestTxHash, processTxHash } for a given refund
export async function fetchRefundTxHashes(refund) {
  if (!refund) return { requestTxHash: null, processTxHash: null }
  const id    = BigInt(refund.refundId)
  const idHex = '0x' + id.toString(16).padStart(64, '0')

  // Scan a single block for a tx to the refund contract matching refundId in topics[1]
  async function scanBlock(blockNumber) {
    if (!blockNumber || blockNumber <= 0n) return null
    try {
      const pc    = client()
      const block = await pc.getBlock({ blockNumber })
      if (!block?.transactions?.length) return null
      for (const txHash of block.transactions) {
        try {
          const receipt = await pc.getTransactionReceipt({ hash: txHash })
          if (receipt?.to?.toLowerCase() !== ARC_REFUND_ADDRESS.toLowerCase()) continue
          for (const log of receipt.logs) {
            if (log.address?.toLowerCase() === ARC_REFUND_ADDRESS.toLowerCase()) {
              if (log.topics?.[1] === idHex) return txHash
            }
          }
        } catch {}
      }
    } catch {}
    return null
  }

  const requestedBlock = refund.requestedBlock ? BigInt(refund.requestedBlock) : null
  const processedBlock = refund.processedBlock ? BigInt(refund.processedBlock) : null

  // requestTxHash: cache → scanBlock(requestedBlock)
  const requestTxHash = getCachedRefundRequestTx(refund.refundId)
    || (requestedBlock ? await scanBlock(requestedBlock) : null)

  // processTxHash: cache → scanBlock(processedBlock)
  const processTxHash = getCachedRefundProcessTx(refund.refundId)
    || (processedBlock ? await scanBlock(processedBlock) : null)

  return { requestTxHash, processTxHash }
}


function extractRefundIdFromReceipt(receipt, eventName) {
  if (!receipt?.logs?.length) return null
  for (const log of receipt.logs) {
    if (log.address?.toLowerCase() !== ARC_REFUND_ADDRESS.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics })
      if (decoded?.eventName === eventName && decoded.args?.refundId != null) {
        return BigInt(decoded.args.refundId).toString()
      }
    } catch {}
  }
  return null
}

// ── Write functions ───────────────────────────────────────────────────────────

export async function requestRefund(account, { merchant, amount, proofRef, reason }) {
  const wc      = getWalletClient()
  const safeRef = (proofRef || '').slice(0, 64)
  const hash    = await wc.writeContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'requestRefund',
    args: [merchant, toUsdc(amount), safeRef, (reason || '').slice(0, 256)],
    account,
  })
  const receipt = await waitAndCheck(hash, 'Refund request')
  const id = extractRefundIdFromReceipt(receipt, 'RefundRequested')
  if (id) cacheRefundRequestTx(id, hash)
  return { hash, refundId: id }
}

export async function approveRefund(account, refundId) {
  const wc     = getWalletClient()
  const refund = await fetchRefundRequest(refundId)

  const approveHash = await wc.writeContract({
    address: USDC_ADDRESS, abi: ERC20,
    functionName: 'approve',
    args: [ARC_REFUND_ADDRESS, toUsdc(refund.amount)],
    account,
  })
  await waitAndCheck(approveHash, 'USDC approve')

  const hash = await wc.writeContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'approveRefund',
    args: [BigInt(refundId)],
    account,
  })
  await waitAndCheck(hash, 'Approve refund')
  cacheRefundProcessTx(refundId, hash)
  return hash
}

export async function denyRefund(account, refundId) {
  const wc   = getWalletClient()
  const hash = await wc.writeContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'denyRefund',
    args: [BigInt(refundId)],
    account,
  })
  await waitAndCheck(hash, 'Deny refund')
  cacheRefundProcessTx(refundId, hash)
  return hash
}

export async function directRefund(account, { customerWallet, amount, proofRef, reason }) {
  const wc      = getWalletClient()
  const safeRef = (proofRef || '').slice(0, 64)

  const approveHash = await wc.writeContract({
    address: USDC_ADDRESS, abi: ERC20,
    functionName: 'approve',
    args: [ARC_REFUND_ADDRESS, toUsdc(amount)],
    account,
  })
  await waitAndCheck(approveHash, 'USDC approve for direct refund')

  const hash = await wc.writeContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'directRefund',
    args: [customerWallet, toUsdc(amount), safeRef, (reason || '').slice(0, 256)],
    account,
  })
  const receipt = await waitAndCheck(hash, 'Direct refund')
  // Cache with real refundId so fetchRefundTxHashes can find it
  const refundId = extractRefundIdFromReceipt(receipt, 'DirectRefund')
  if (refundId) cacheRefundProcessTx(refundId, hash)
  return hash
}

// ── Read functions ────────────────────────────────────────────────────────────
export async function fetchRefundRequest(id) {
  const raw = await client().readContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'getRefundRequest',
    args: [BigInt(id)],
  })
  return parseRefund(raw, id)
}

export async function fetchMerchantRefundIds(merchant) {
  const ids = await client().readContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'getMerchantRefunds',
    args: [merchant],
  })
  return ids.map(id => id.toString())
}

export async function fetchCustomerRefundIds(customer) {
  const ids = await client().readContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'getCustomerRefunds',
    args: [customer],
  })
  return ids.map(id => id.toString())
}

export async function totalRefunds() {
  return await client().readContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'totalRefunds',
  })
}

function parseRefund(raw, id) {
  if (!raw) return null
  const get = (name, index, fallback = undefined) => raw?.[name] ?? raw?.[index] ?? fallback
  return {
    refundId:       id.toString(),
    merchant:       get('merchant', 0),
    customer:       get('customer', 1),
    amount:         fromUsdc(get('amount', 2, 0n)),
    proofRef:       get('proofRef', 3, ''),
    reason:         get('reason', 4, ''),
    status:         normalizeRefundStatus(get('status', 5, 0)) ?? 0,
    requestedAt:    Number(get('requestedAt', 6, 0)),
    processedAt:    Number(get('processedAt', 7, 0)),
    // v4 block tracking for scanBlock-based TX hash recovery
    requestedBlock: Number(get('requestedBlock', 8, 0)),
    processedBlock: Number(get('processedBlock', 9, 0)),
  }
}
