import { getWalletClient, getPublicClient } from './wallet.js'
import { ARC_REFUND_ADDRESS, USDC_ADDRESS } from '../config.js'
import ABI    from '../abis/ArcRefund.json'
import ERC20  from '../abis/ERC20.json'
function client() { return getPublicClient() }

// ── Status labels ─────────────────────────────────────────────────────────────
export const REFUND_STATUS_LABEL = {
  0: 'Requested',
  1: 'Approved',
  2: 'Denied',
  3: 'Expired',
}
export const REFUND_STATUS_COLOR = {
  0: 'var(--yellow)',
  1: 'var(--green)',
  2: '#f08080',
  3: 'var(--text3)',
}

function toUsdc(amount) { return BigInt(Math.round(parseFloat(amount) * 1e6)) }
function fromUsdc(v)    { return (Number(v) / 1e6).toFixed(2) }

// ── Write functions ───────────────────────────────────────────────────────────

export async function requestRefund(account, { merchant, amount, proofRef, reason, expiresAt }) {
  const wc   = getWalletClient()
  const hash = await wc.writeContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'requestRefund',
    args: [
      merchant,
      toUsdc(amount),
      proofRef,
      reason,
      BigInt(Math.floor(expiresAt / 1000)),
    ],
    account,
  })
  const receipt = await client().waitForTransactionReceipt({ hash })
  const id = receipt.logs?.[0]?.topics?.[1]
    ? BigInt(receipt.logs[0].topics[1]).toString()
    : null
  return { hash, refundId: id }
}

export async function approveRefund(account, refundId) {
  const wc = getWalletClient()

  // Step 1: fetch refund to know amount + customer
  const refund = await fetchRefundRequest(refundId)
  const amountRaw = toUsdc(refund.amount)

  // Step 2: approve USDC spend from merchant wallet
  const approveHash = await wc.writeContract({
    address: USDC_ADDRESS, abi: ERC20,
    functionName: 'approve',
    args: [ARC_REFUND_ADDRESS, amountRaw],
    account,
  })
  await client().waitForTransactionReceipt({ hash: approveHash })

  // Step 3: approveRefund on contract
  const hash = await wc.writeContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'approveRefund',
    args: [BigInt(refundId)],
    account,
  })
  await client().waitForTransactionReceipt({ hash })
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
  await client().waitForTransactionReceipt({ hash })
  return hash
}

export async function expireRefund(account, refundId) {
  const wc   = getWalletClient()
  const hash = await wc.writeContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'expireRefund',
    args: [BigInt(refundId)],
    account,
  })
  await client().waitForTransactionReceipt({ hash })
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

// ── Parser ────────────────────────────────────────────────────────────────────
function parseRefund(raw, id) {
  if (!raw) return null
  return {
    refundId:    id.toString(),
    merchant:    raw.merchant,
    customer:    raw.customer,
    amount:      fromUsdc(raw.amount),
    proofRef:    raw.proofRef,
    reason:      raw.reason,
    status:      Number(raw.status),
    requestedAt: Number(raw.requestedAt),
    expiresAt:   Number(raw.expiresAt),
    processedAt: Number(raw.processedAt),
  }
}
