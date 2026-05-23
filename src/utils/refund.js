import { parseUnits } from 'viem'
import { getWalletClient, getPublicClient } from './wallet.js'
import { ARC_REFUND_ADDRESS, USDC_ADDRESS, USDC_DECIMALS } from '../config.js'
import ABI   from '../abis/ArcRefund.json'
import ERC20 from '../abis/ERC20.json'
function client() { return getPublicClient() }

// ── Status labels ─────────────────────────────────────────────────────────────
// v2: status 3 = Direct (merchant-initiated), no Expired state
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

function toUsdc(amount) { return BigInt(Math.round(parseFloat(amount) * 1e6)) }
function fromUsdc(v)    { return (Number(v) / 1e6).toFixed(2) }

// ── Customer: request refund ──────────────────────────────────────────────────
// No expiresAt — merchant has no on-chain deadline to approve/deny.
// The UI enforces the customer request window (refundClaimWindowDays minutes).
export async function requestRefund(account, { merchant, amount, proofRef, reason }) {
  const wc   = getWalletClient()
  const hash = await wc.writeContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'requestRefund',
    args: [merchant, toUsdc(amount), proofRef, reason || ''],
    account,
  })
  const receipt = await client().waitForTransactionReceipt({ hash })
  const id = receipt.logs?.[0]?.topics?.[1]
    ? BigInt(receipt.logs[0].topics[1]).toString()
    : null
  return { hash, refundId: id }
}

// ── Merchant: approve customer request ───────────────────────────────────────
// No time limit. Merchant approves USDC spend then contract transfers to customer.
export async function approveRefund(account, refundId) {
  const wc     = getWalletClient()
  const refund = await fetchRefundRequest(refundId)

  // Step 1: approve USDC spend
  const approveHash = await wc.writeContract({
    address: USDC_ADDRESS, abi: ERC20,
    functionName: 'approve',
    args: [ARC_REFUND_ADDRESS, toUsdc(refund.amount)],
    account,
  })
  await client().waitForTransactionReceipt({ hash: approveHash })

  // Step 2: approve refund — contract pulls USDC from merchant to customer
  const hash = await wc.writeContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'approveRefund',
    args: [BigInt(refundId)],
    account,
  })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

// ── Merchant: deny customer request ──────────────────────────────────────────
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

// ── Merchant: direct refund (no prior request needed) ─────────────────────────
// Off-chain agreed refund — merchant sends USDC directly.
// Same pattern as hotel/travel cancellation.
// Merchant must hold sufficient USDC. Uses USDC.transfer() via contract.
export async function directRefund(account, { customerWallet, amount, proofRef, reason }) {
  const wc   = getWalletClient()
  const hash = await wc.writeContract({
    address: ARC_REFUND_ADDRESS, abi: ABI,
    functionName: 'directRefund',
    args: [customerWallet, toUsdc(amount), proofRef || '', reason || ''],
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
    processedAt: Number(raw.processedAt),
  }
}
