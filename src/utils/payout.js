// payout.js — ArcMerchantPayouts read/write utilities
import { parseUnits, formatUnits, keccak256, toBytes, decodeEventLog } from 'viem'
import {
  ARC_MERCHANT_PAYOUTS_ADDRESS, USDC_ADDRESS, USDC_DECIMALS,
  ARCSCAN_BASE, APP_URL,
} from '../config.js'
import ABI       from '../abis/ArcMerchantPayouts.json'
import ERC20ABI  from '../abis/ERC20.json'
import { getPublicClient, getWalletClient } from './wallet.js'

const pc  = () => getPublicClient()
const wc  = () => getWalletClient()

export const PAYOUT_PURPOSE_CODES = [
  { value: 'SUPPLIER',   label: 'Supplier Payment'   },
  { value: 'CONTRACTOR', label: 'Contractor Payment' },
  { value: 'TEAM',       label: 'Team Payment'       },
  { value: 'OTHER',      label: 'Other'              },
]

export const COUNTERPARTY_CATEGORIES = [
  { value: 'Supplier',   label: 'Supplier'   },
  { value: 'Contractor', label: 'Contractor' },
  { value: 'Team',       label: 'Team'       },
  { value: 'Other',      label: 'Other'      },
]

export function toUsdc(human)  { return parseUnits(String(human), USDC_DECIMALS) }
export function fromUsdc(raw)  { try { return parseFloat(formatUnits(BigInt(raw.toString()), USDC_DECIMALS)) } catch { return parseFloat(raw) || 0 } }
export function fmtUsdc(raw)   { return fromUsdc(raw).toFixed(2) }

export function formatTs(unix) {
  if (!unix || Number(unix) === 0) return '—'
  return new Date(Number(unix) * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

export function computePayoutMetadataHash(...fields) {
  const text = fields.filter(Boolean).join('|')
  if (!text) return '0x' + '0'.repeat(64)
  return keccak256(toBytes(text))
}

// ── USDC approval ─────────────────────────────────────────────────────────
export async function approveUsdcForPayouts(account, amountHuman) {
  const amount = toUsdc(amountHuman)
  const allowance = await pc().readContract({
    address: USDC_ADDRESS, abi: ERC20ABI, functionName: 'allowance',
    args: [account, ARC_MERCHANT_PAYOUTS_ADDRESS],
  })
  if (BigInt(allowance) >= amount) return null  // already approved
  const hash = await wc().writeContract({
    address: USDC_ADDRESS, abi: ERC20ABI,
    functionName: 'approve', args: [ARC_MERCHANT_PAYOUTS_ADDRESS, amount],
    account,
  })
  await pc().waitForTransactionReceipt({ hash })
  return hash
}

// ── Counterparties ────────────────────────────────────────────────────────
export async function executeCreateCounterparty(account, { wallet, aliasName, category, metadataHash }) {
  const hash = await wc().writeContract({
    address: ARC_MERCHANT_PAYOUTS_ADDRESS, abi: ABI,
    functionName: 'createCounterparty',
    args: [wallet, aliasName, category, metadataHash || ('0x' + '0'.repeat(64))],
    account,
  })
  const receipt = await pc().waitForTransactionReceipt({ hash })
  let counterpartyId = null
  for (const log of receipt.logs) {
    try {
      const dec = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics, eventName: 'CounterpartyCreated' })
      if (dec.eventName === 'CounterpartyCreated') {
        counterpartyId = Number(dec.args.counterpartyId)
        break
      }
    } catch {}
  }
  return { hash, counterpartyId }
}

export async function executeUpdateCounterparty(account, counterpartyId, { wallet, aliasName, category, metadataHash, active = true }) {
  const hash = await wc().writeContract({
    address: ARC_MERCHANT_PAYOUTS_ADDRESS, abi: ABI,
    functionName: 'updateCounterparty',
    args: [
      BigInt(counterpartyId),
      wallet,
      aliasName,
      category,
      metadataHash || ('0x' + '0'.repeat(64)),
      Boolean(active),
    ],
    account,
  })
  await pc().waitForTransactionReceipt({ hash })
  return hash
}

export async function executeDeactivateCounterparty(account, counterpartyId) {
  const hash = await wc().writeContract({
    address: ARC_MERCHANT_PAYOUTS_ADDRESS, abi: ABI,
    functionName: 'deactivateCounterparty',
    args: [BigInt(counterpartyId)],
    account,
  })
  await pc().waitForTransactionReceipt({ hash })
  return hash
}

export async function fetchCounterparty(counterpartyId) {
  return await pc().readContract({
    address: ARC_MERCHANT_PAYOUTS_ADDRESS, abi: ABI,
    functionName: 'getCounterparty', args: [BigInt(counterpartyId)],
  })
}

export async function fetchMerchantCounterparties(merchant) {
  const ids = await pc().readContract({
    address: ARC_MERCHANT_PAYOUTS_ADDRESS, abi: ABI,
    functionName: 'getMerchantCounterparties', args: [merchant],
  })
  const list = []
  for (const id of ids) {
    try {
      const c = await fetchCounterparty(id.toString())
      list.push({ id: id.toString(), ...c })
    } catch {}
  }
  return list
}

// ── Payouts ───────────────────────────────────────────────────────────────
const _payoutTxCache = new Map()
export function cachePayoutTx(payoutId, hash)    { _payoutTxCache.set(String(payoutId), hash) }
export function getCachedPayoutTx(payoutId)      { return _payoutTxCache.get(String(payoutId)) || null }

export async function executeSinglePayout(account, {
  recipient, amount, paymentRef, description, purposeCode, metadataHash, counterpartyId,
}) {
  const amt = toUsdc(amount)
  // Approve
  await approveUsdcForPayouts(account, amount)
  // Execute
  const hash = await wc().writeContract({
    address: ARC_MERCHANT_PAYOUTS_ADDRESS, abi: ABI,
    functionName: 'createPayout',
    args: [
      recipient, amt, paymentRef, description, purposeCode,
      metadataHash || ('0x' + '0'.repeat(64)),
      BigInt(counterpartyId || 0),
    ],
    account,
  })
  const receipt = await pc().waitForTransactionReceipt({ hash })
  let payoutId = null
  for (const log of receipt.logs) {
    try {
      const dec = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics, eventName: 'PayoutExecuted' })
      if (dec.eventName === 'PayoutExecuted') {
        payoutId = Number(dec.args.payoutId)
        break
      }
    } catch {}
  }
  if (payoutId) cachePayoutTx(payoutId, hash)
  return { hash, payoutId }
}

export async function executeBatchPayout(account, {
  rows, batchRef, purposeCode, metadataHash,
}) {
  // rows: [{ recipient, amount, paymentRef, description, counterpartyId? }]
  const recipients   = rows.map(r => r.recipient)
  const amounts      = rows.map(r => toUsdc(r.amount))
  const paymentRefs  = rows.map(r => r.paymentRef)
  const descriptions = rows.map(r => r.description)
  const cpIds        = rows.map(r => BigInt(r.counterpartyId || 0))
  const totalHuman   = rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0)

  await approveUsdcForPayouts(account, totalHuman.toFixed(6))

  const hash = await wc().writeContract({
    address: ARC_MERCHANT_PAYOUTS_ADDRESS, abi: ABI,
    functionName: 'createBatchPayout',
    args: [
      recipients, amounts, batchRef, paymentRefs, descriptions,
      purposeCode, metadataHash || ('0x' + '0'.repeat(64)),
      cpIds,
    ],
    account,
  })
  const receipt = await pc().waitForTransactionReceipt({ hash })
  const payoutIds = []
  for (const log of receipt.logs) {
    try {
      const dec = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics, eventName: 'PayoutExecuted' })
      if (dec.eventName === 'PayoutExecuted') {
        payoutIds.push(Number(dec.args.payoutId))
      }
    } catch {}
  }
  for (const pid of payoutIds) cachePayoutTx(pid, hash)
  return { hash, payoutIds }
}

export async function fetchPayout(payoutId) {
  return await pc().readContract({
    address: ARC_MERCHANT_PAYOUTS_ADDRESS, abi: ABI,
    functionName: 'getPayout', args: [BigInt(payoutId)],
  })
}

export async function fetchMerchantPayouts(merchant) {
  const ids = await pc().readContract({
    address: ARC_MERCHANT_PAYOUTS_ADDRESS, abi: ABI,
    functionName: 'getMerchantPayouts', args: [merchant],
  })
  const list = []
  for (const id of [...ids].reverse()) {
    try {
      const p = await fetchPayout(id.toString())
      list.push({ id: id.toString(), ...p })
    } catch {}
  }
  return list
}

export async function fetchRecipientPayouts(recipient) {
  const ids = await pc().readContract({
    address: ARC_MERCHANT_PAYOUTS_ADDRESS, abi: ABI,
    functionName: 'getRecipientPayouts', args: [recipient],
  })
  const list = []
  for (const id of [...ids].reverse()) {
    try {
      const p = await fetchPayout(id.toString())
      list.push({ id: id.toString(), ...p })
    } catch {}
  }
  return list
}

// ── TX hash recovery via scanBlock (proven pattern from booking/travel) ───
export async function fetchPayoutTxHash(payout) {
  if (!payout) return null
  const id = BigInt(payout.id || 0)
  const createdBlock = payout.createdBlock ? BigInt(payout.createdBlock) : null
  const cached = getCachedPayoutTx(id.toString())
  if (cached) return cached
  if (!createdBlock || createdBlock <= 0n) return null

  try {
    const c     = pc()
    const block = await c.getBlock({ blockNumber: createdBlock })
    if (!block?.transactions?.length) return null
    const idHex = '0x' + id.toString(16).padStart(64, '0')
    for (const txHash of block.transactions) {
      try {
        const r = await c.getTransactionReceipt({ hash: txHash })
        if (r?.to?.toLowerCase() !== ARC_MERCHANT_PAYOUTS_ADDRESS.toLowerCase()) continue
        for (const log of r.logs) {
          if (log.address?.toLowerCase() === ARC_MERCHANT_PAYOUTS_ADDRESS.toLowerCase()) {
            if (log.topics?.[1] === idHex) return txHash
          }
        }
      } catch {}
    }
  } catch {}
  return null
}

export function payoutPageUrl(payoutId) { return `${APP_URL}/payout/${payoutId}` }
export function arcScanTxUrl(txHash)    { return txHash ? `${ARCSCAN_BASE}/tx/${txHash}` : '' }
