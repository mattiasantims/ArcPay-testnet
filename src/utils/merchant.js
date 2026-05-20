// merchant.js — ArcMerchantRegistry read/write utilities
import { getPublicClient, getWalletClient } from './wallet.js'
import { ARCMERCHANT_REGISTRY_ADDRESS } from '../config.js'
import ABI from '../abis/ArcMerchantRegistry.json'

function client() { return getPublicClient() }

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getMerchantIdByWallet(wallet) {
  try {
    const id = await client().readContract({ address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI, functionName: 'getMerchantIdByWallet', args: [wallet] })
    return Number(id)
  } catch { return 0 }
}

export async function getMerchant(merchantId) {
  try {
    const m = await client().readContract({ address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI, functionName: 'getMerchant', args: [BigInt(merchantId)] })
    return parseMerchant(m)
  } catch { return null }
}

export async function getMerchantByWallet(wallet) {
  try {
    const m = await client().readContract({ address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI, functionName: 'getMerchantByWallet', args: [wallet] })
    return parseMerchant(m)
  } catch { return null }
}

export async function getMerchantWallets(merchantId) {
  try {
    return await client().readContract({ address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI, functionName: 'getMerchantWallets', args: [BigInt(merchantId)] })
  } catch { return [] }
}

export async function getMerchantPolicy(merchantId) {
  try {
    const p = await client().readContract({ address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI, functionName: 'getMerchantPolicy', args: [BigInt(merchantId)] })
    return parsePolicy(p)
  } catch { return null }
}

export async function getMerchantPolicyByWallet(wallet) {
  try {
    const p = await client().readContract({ address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI, functionName: 'getMerchantPolicyByWallet', args: [wallet] })
    return parsePolicy(p)
  } catch { return null }
}

export async function isWalletLinked(wallet) {
  try {
    return await client().readContract({ address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI, functionName: 'isWalletLinked', args: [wallet] })
  } catch { return false }
}

export async function totalMerchants() {
  try {
    const n = await client().readContract({ address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI, functionName: 'totalMerchants' })
    return Number(n)
  } catch { return 0 }
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function registerMerchant(account, fields) {
  const wc = getWalletClient()
  const hash = await wc.writeContract({
    address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI,
    functionName: 'registerMerchant',
    args: fieldsToArgs(fields), account,
  })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

export async function updateMerchantProfile(account, fields) {
  const wc = getWalletClient()
  const hash = await wc.writeContract({
    address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI,
    functionName: 'updateMerchantProfile',
    args: fieldsToArgs(fields), account,
  })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

export async function updateMerchantPolicy(account, policy) {
  const wc = getWalletClient()
  const hash = await wc.writeContract({
    address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI,
    functionName: 'updateMerchantPolicy',
    args: [
      policy.allowScheduledTranche ?? false,
      BigInt(policy.defaultNonRefundableBps   ?? 3000),
      BigInt(policy.defaultInitialPaymentBps  ?? 1000),
      BigInt(policy.defaultTrancheBps         ?? 3000),
      BigInt(policy.paymentDueOffsetDays      ?? 90),
      BigInt(policy.paymentDeadlineOffsetDays ?? 75),
      BigInt(policy.cancellationCutoffDays    ?? 30),
      BigInt(policy.refundBpsBeforeCutoff     ?? 7000),
      BigInt(policy.refundBpsAfterCutoff      ?? 0),
    ],
    account,
  })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

export async function addWallet(account, wallet) {
  const wc = getWalletClient()
  const hash = await wc.writeContract({ address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI, functionName: 'addWallet', args: [wallet], account })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

export async function removeWallet(account, wallet) {
  const wc = getWalletClient()
  const hash = await wc.writeContract({ address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI, functionName: 'removeWallet', args: [wallet], account })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

export async function deactivateMerchant(account) {
  const wc = getWalletClient()
  const hash = await wc.writeContract({ address: ARCMERCHANT_REGISTRY_ADDRESS, abi: ABI, functionName: 'deactivateMerchant', args: [], account })
  await client().waitForTransactionReceipt({ hash })
  return hash
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseMerchant(m) {
  if (!m || !m.merchantId) return null
  return {
    merchantId:            Number(m.merchantId),
    ownerWallet:           m.ownerWallet,
    tradingName:           m.tradingName,
    legalName:             m.legalName,
    businessCategory:      m.businessCategory,
    website:               m.website,
    country:               m.country,
    businessAddress:       m.businessAddress,
    businessEmail:         m.businessEmail,
    lei:                   m.lei,
    vatOrCompanyId:        m.vatOrCompanyId,
    otherPublicIdentifier: m.otherPublicIdentifier,
    profileHash:           m.profileHash,
    profileVersion:        Number(m.profileVersion),
    active:                m.active,
    createdAt:             Number(m.createdAt),
    updatedAt:             Number(m.updatedAt),
  }
}

function parsePolicy(p) {
  if (!p) return defaultPolicy()
  return {
    allowScheduledTranche:     p.allowScheduledTranche ?? false,
    allowRefund:               p.allowRefund ?? true,
    defaultNonRefundableBps:   Number(p.defaultNonRefundableBps   ?? 3000),
    defaultInitialPaymentBps:  Number(p.defaultInitialPaymentBps  ?? 1000),
    defaultTrancheBps:         Number(p.defaultTrancheBps         ?? 3000),
    paymentDueOffsetDays:      Number(p.paymentDueOffsetDays      ?? 90),
    paymentDeadlineOffsetDays: Number(p.paymentDeadlineOffsetDays ?? 75),
    cancellationCutoffDays:    Number(p.cancellationCutoffDays    ?? 30),
    refundBpsBeforeCutoff:     Number(p.refundBpsBeforeCutoff     ?? 7000),
    refundBpsAfterCutoff:      Number(p.refundBpsAfterCutoff      ?? 0),
    policyVersion:             Number(p.policyVersion             ?? 1),
    updatedAt:                 Number(p.updatedAt                 ?? 0),
  }
}

export function defaultPolicy() {
  return {
    allowScheduledTranche:     false,
    allowRefund:               true,
    defaultNonRefundableBps:   3000,
    defaultInitialPaymentBps:  1000,
    defaultTrancheBps:         3000,
    paymentDueOffsetDays:      90,
    paymentDeadlineOffsetDays: 75,
    cancellationCutoffDays:    30,
    refundBpsBeforeCutoff:     7000,
    refundBpsAfterCutoff:      0,
    policyVersion:             1,
    updatedAt:                 0,
  }
}

// Versione del form in percentuali (non BPS)
export function defaultPolicyForm() {
  return {
    allowScheduledTranche:     false,
    allowRefund:               true,
    defaultNonRefundableBps:   30,
    defaultInitialPaymentBps:  10,
    defaultTrancheBps:         30,
    paymentDueOffsetDays:      10,
    paymentDeadlineOffsetDays: 5,
    cancellationCutoffDays:    15,
    refundBpsBeforeCutoff:     70,
    refundBpsAfterCutoff:      0,
  }
}

function fieldsToArgs(f) {
  return [
    f.tradingName           || '',
    f.legalName             || '',
    f.businessCategory      || '',
    f.website               || '',
    f.country               || '',
    f.businessAddress       || '',
    f.businessEmail         || '',
    f.lei                   || '',
    f.vatOrCompanyId        || '',
    f.otherPublicIdentifier || '',
  ]
}

export const BUSINESS_CATEGORIES = [
  'Hotel / Hospitality',
  'Luxury Retail',
  'Boutique',
  'Travel Agency',
  'Online Merchant',
  'Freelancer / Consultant',
  'B2B Services',
  'Charity / Non-profit',
  'E-commerce',
  'Real Estate',
  'Other',
]
