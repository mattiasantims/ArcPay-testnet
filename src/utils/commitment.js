import { parseUnits } from 'viem'
import { getWalletClient, getPublicClient } from './wallet.js'
import { ARC_COMMITMENT_ADDRESS, USDC_ADDRESS, USDC_DECIMALS } from '../config.js'
import ABI from '../abis/ArcPaymentCommitment.json'
import ERC20 from '../abis/ERC20.json'
function client() { return getPublicClient() }

// ── Status / Type labels ──────────────────────────────────────────────────────
export const COMMITMENT_STATUS = { Active: 0, Fulfilled: 1, Cancelled: 2, Expired: 3 }
export const COMMITMENT_TYPE   = { Delayed: 0, Tranche: 1 }

export const COMMITMENT_STATUS_LABEL = {
  0: 'Active',
  1: 'Fulfilled',
  2: 'Cancelled',
  3: 'Expired',
}
export const COMMITMENT_TYPE_LABEL = {
  0: 'Delayed Payment',
  1: 'Tranche Payment',
}
export const COMMITMENT_STATUS_COLOR = {
  0: 'var(--usdc)',
  1: 'var(--green)',
  2: '#f08080',
  3: 'var(--text3)',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toUsdc(amount) { return BigInt(Math.round(parseFloat(amount) * 1e6)) }

async function waitAndCheck(hash, label = 'Transaction') {
  const receipt = await client().waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`${label} reverted on-chain. Check wallet and USDC balance.`)
  }
  return receipt
}

async function approveCommitmentUsdc(account, amountHuman) {
  const wc  = getWalletClient()
  const amt = parseUnits(amountHuman.toString(), USDC_DECIMALS)
  const hash = await wc.writeContract({
    address: USDC_ADDRESS, abi: ERC20,
    functionName: 'approve',
    args: [ARC_COMMITMENT_ADDRESS, amt],
    account,
  })
  await waitAndCheck(hash, 'USDC approve')
  return hash
}

export function formatCommitmentRef(id, type) {
  const prefix = type === 1 ? 'TRN' : 'DLY'
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${prefix}-${date}-${String(id).padStart(4, '0')}`
}

// ── TX hash cache (module-level maps, session-only) ───────────────────────────
const _txCache       = new Map() // commitmentId -> creation TX hash
const _fulfillCache  = new Map() // commitmentId -> fulfill TX hash
const _trancheCache  = new Map() // `${commitmentId}-${trancheIndex}` -> TX hash
const _cancelCache   = new Map() // commitmentId -> cancel TX hash

export function cacheCommitmentTxHash(id, hash)            { _txCache.set(String(id), hash) }
export function getCachedCommitmentTxHash(id)               { return _txCache.get(String(id)) || null }
export function cacheFulfillTxHash(id, hash)               { _fulfillCache.set(String(id), hash) }
export function getCachedFulfillTxHash(id)                  { return _fulfillCache.get(String(id)) || null }
export function cacheTrancheTxHash(id, idx, hash)          { _trancheCache.set(`${id}-${idx}`, hash) }
export function getCachedTrancheTxHash(id, idx)             { return _trancheCache.get(`${id}-${idx}`) || null }
export function cacheCancelTxHash(id, hash)                { _cancelCache.set(String(id), hash) }
export function getCachedCancelTxHash(id)                   { return _cancelCache.get(String(id)) || null }

// ── Write functions ───────────────────────────────────────────────────────────

export async function createDelayedCommitment(account, {
  merchant, amount, dueDate, deadline, ref, description, metadataHash,
}) {
  const wc   = getWalletClient()
  const hash = await wc.writeContract({
    address: ARC_COMMITMENT_ADDRESS, abi: ABI,
    functionName: 'createDelayedCommitment',
    args: [
      merchant,
      toUsdc(amount),
      BigInt(Math.floor(dueDate / 1000)),
      BigInt(Math.floor(deadline / 1000)),
      ref,
      description,
      metadataHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
    ],
    account,
  })
  const receipt = await waitAndCheck(hash, 'Create delayed commitment')
  const id = receipt.logs?.[0]?.topics?.[1]
    ? BigInt(receipt.logs[0].topics[1]).toString()
    : null
  if (id) cacheCommitmentTxHash(id, hash)
  return { hash, commitmentId: id }
}

export async function createTrancheCommitment(account, {
  merchant, trancheAmounts, trancheDueDates, trancheDeadlines, ref, description, metadataHash,
}) {
  const wc   = getWalletClient()
  const hash = await wc.writeContract({
    address: ARC_COMMITMENT_ADDRESS, abi: ABI,
    functionName: 'createTrancheCommitment',
    args: [
      merchant,
      trancheAmounts.map(a => toUsdc(a)),
      trancheDueDates.map(d => BigInt(Math.floor(d / 1000))),
      trancheDeadlines.map(d => BigInt(Math.floor(d / 1000))),
      ref,
      description,
      metadataHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
    ],
    account,
  })
  const receipt = await waitAndCheck(hash, 'Create tranche commitment')
  const id = receipt.logs?.[0]?.topics?.[1]
    ? BigInt(receipt.logs[0].topics[1]).toString()
    : null
  if (id) cacheCommitmentTxHash(id, hash)
  return { hash, commitmentId: id }
}

export async function fulfillDelayedCommitment(account, commitmentId) {
  const commitment = await fetchCommitment(commitmentId)
  if (!commitment) throw new Error('Commitment not found')
  await approveCommitmentUsdc(account, commitment.totalAmount)

  const wc   = getWalletClient()
  const hash = await wc.writeContract({
    address: ARC_COMMITMENT_ADDRESS, abi: ABI,
    functionName: 'fulfillDelayedCommitment',
    args: [BigInt(commitmentId)],
    account,
  })
  await waitAndCheck(hash, 'Fulfill payment')
  cacheFulfillTxHash(commitmentId, hash)
  return hash
}

export async function fulfillTranche(account, commitmentId, trancheIndex) {
  const commitment = await fetchCommitment(commitmentId)
  if (!commitment) throw new Error('Commitment not found')
  const amount = commitment.trancheAmounts?.[Number(trancheIndex)]
  if (!amount) throw new Error('Invalid tranche index')
  await approveCommitmentUsdc(account, amount)

  const wc   = getWalletClient()
  const hash = await wc.writeContract({
    address: ARC_COMMITMENT_ADDRESS, abi: ABI,
    functionName: 'fulfillTranche',
    args: [BigInt(commitmentId), BigInt(trancheIndex)],
    account,
  })
  await waitAndCheck(hash, `Fulfill tranche ${Number(trancheIndex) + 1}`)
  cacheTrancheTxHash(commitmentId, trancheIndex, hash)
  return hash
}

export async function cancelCommitment(account, commitmentId) {
  const wc   = getWalletClient()
  const hash = await wc.writeContract({
    address: ARC_COMMITMENT_ADDRESS, abi: ABI,
    functionName: 'cancelCommitment',
    args: [BigInt(commitmentId)],
    account,
  })
  await waitAndCheck(hash, 'Cancel commitment')
  cacheCancelTxHash(commitmentId, hash)
  return hash
}

// ── Read functions ────────────────────────────────────────────────────────────

export async function fetchCommitment(id) {
  const c = client()
  const raw = await c.readContract({
    address: ARC_COMMITMENT_ADDRESS, abi: ABI,
    functionName: 'getCommitment',
    args: [BigInt(id)],
  })
  return parseCommitment(raw, id)
}

export async function fetchMerchantCommitmentIds(merchant) {
  const c   = client()
  const ids = await c.readContract({
    address: ARC_COMMITMENT_ADDRESS, abi: ABI,
    functionName: 'getMerchantCommitments',
    args: [merchant],
  })
  return ids.map(id => id.toString())
}

export async function fetchCustomerCommitmentIds(customer) {
  const c   = client()
  const ids = await c.readContract({
    address: ARC_COMMITMENT_ADDRESS, abi: ABI,
    functionName: 'getCustomerCommitments',
    args: [customer],
  })
  return ids.map(id => id.toString())
}

export async function totalCommitments() {
  return await client().readContract({
    address: ARC_COMMITMENT_ADDRESS, abi: ABI,
    functionName: 'totalCommitments',
  })
}

// ── Parser ────────────────────────────────────────────────────────────────────
function parseCommitment(raw, id) {
  if (!raw) return null
  const fromUsdc = v => (Number(v) / 1e6).toFixed(2)
  return {
    commitmentId:     id.toString(),
    merchant:         raw.merchant,
    customer:         raw.customer,
    totalAmount:      fromUsdc(raw.totalAmount),
    ref:              raw.ref,
    description:      raw.description,
    metadataHash:     raw.metadataHash,
    type:             Number(raw.commitmentType),
    status:           Number(raw.status),
    createdAt:        Number(raw.createdAt),
    // Delayed
    dueDate:          Number(raw.dueDate),
    deadline:         Number(raw.deadline),
    paid:             raw.paid,
    // Tranche
    trancheAmounts:   raw.trancheAmounts?.map(a => fromUsdc(a)) ?? [],
    trancheDueDates:  raw.trancheDueDates?.map(d => Number(d)) ?? [],
    trancheDeadlines: raw.trancheDeadlines?.map(d => Number(d)) ?? [],
    tranchePaid:      raw.tranchePaid ?? [],
    tranchesPaidCount: Number(raw.tranchesPaidCount ?? 0),
  }
}
