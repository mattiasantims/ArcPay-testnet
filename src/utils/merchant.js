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
      policy.allowScheduledTranche              ?? false,
      BigInt(policy.defaultNonRefundableBps     ?? 3000),
      BigInt(policy.defaultInitialPaymentBps    ?? 1000),
      BigInt(policy.defaultTrancheBps           ?? 3000),
      BigInt(policy.paymentDueOffsetDays        ?? 90),
      BigInt(policy.paymentDeadlineOffsetDays   ?? 75),
      BigInt(policy.cancellationCutoffDays      ?? 30),
      BigInt(policy.refundBpsBeforeCutoff       ?? 7000),
      BigInt(policy.refundBpsAfterCutoff        ?? 0),
      policy.allowDelayedPayment                ?? false,
      BigInt(policy.defaultDelayedPaymentDays   ?? 30),
      policy.allowOnlineTranche                 ?? false,
      BigInt(policy.defaultOnlineTrancheBps     ?? 5000),
      BigInt(policy.defaultOnlineTrancheOffsetDays ?? 15),
      policy.allowRefundClaim                   ?? false,
      BigInt(policy.refundClaimWindowDays       ?? 14),
      BigInt(policy.refundClaimBps              ?? 10000),
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

  // viem usually decodes named tuple fields as object properties, but depending
  // on ABI/runtime shape it can also expose tuple values by numeric index.
  // Keep both paths so the UI can always reload policy data from chain after a
  // refresh, including the v3 fields added for delayed/tranche/refund claim.
  const v = (name, index, fallback) => p?.[name] ?? p?.[index] ?? fallback

  return {
    allowScheduledTranche:          Boolean(v('allowScheduledTranche',          0, false)),
    // allowRefund is not part of the deployed v3 policy tuple; keep it as a UI
    // compatibility flag for older components that still read it.
    allowRefund:                    Boolean(p?.allowRefund ?? true),
    defaultNonRefundableBps:        Number(v('defaultNonRefundableBps',         1, 3000)),
    defaultInitialPaymentBps:       Number(v('defaultInitialPaymentBps',        2, 1000)),
    defaultTrancheBps:              Number(v('defaultTrancheBps',               3, 3000)),
    paymentDueOffsetDays:           Number(v('paymentDueOffsetDays',            4, 90)),
    paymentDeadlineOffsetDays:      Number(v('paymentDeadlineOffsetDays',       5, 75)),
    cancellationCutoffDays:         Number(v('cancellationCutoffDays',          6, 30)),
    refundBpsBeforeCutoff:          Number(v('refundBpsBeforeCutoff',           7, 7000)),
    refundBpsAfterCutoff:           Number(v('refundBpsAfterCutoff',            8, 0)),
    allowDelayedPayment:            Boolean(v('allowDelayedPayment',            9, false)),
    defaultDelayedPaymentDays:      Number(v('defaultDelayedPaymentDays',      10, 30)),
    allowOnlineTranche:             Boolean(v('allowOnlineTranche',            11, false)),
    defaultOnlineTrancheBps:        Number(v('defaultOnlineTrancheBps',        12, 5000)),
    defaultOnlineTrancheOffsetDays: Number(v('defaultOnlineTrancheOffsetDays', 13, 15)),
    allowRefundClaim:               Boolean(v('allowRefundClaim',              14, false)),
    refundClaimWindowDays:          Number(v('refundClaimWindowDays',          15, 14)),
    refundClaimBps:                 Number(v('refundClaimBps',                 16, 10000)),
    policyVersion:                  Number(v('policyVersion',                  17, 1)),
    updatedAt:                      Number(v('updatedAt',                      18, 0)),
  }
}

export function defaultPolicy() {
  return {
    allowScheduledTranche:          false,
    allowRefund:                    true,
    defaultNonRefundableBps:        3000,
    defaultInitialPaymentBps:       1000,
    defaultTrancheBps:              3000,
    paymentDueOffsetDays:           90,
    paymentDeadlineOffsetDays:      75,
    cancellationCutoffDays:         30,
    refundBpsBeforeCutoff:          7000,
    refundBpsAfterCutoff:           0,
    allowDelayedPayment:            false,
    defaultDelayedPaymentDays:      30,
    allowOnlineTranche:             false,
    defaultOnlineTrancheBps:        5000,
    defaultOnlineTrancheOffsetDays: 15,
    allowRefundClaim:               false,
    refundClaimWindowDays:          14,
    refundClaimBps:                 10000,
    policyVersion:                  1,
    updatedAt:                      0,
  }
}

// Versione del form in percentuali (non BPS)
export function defaultPolicyForm() {
  return {
    allowScheduledTranche:          false,
    allowRefund:                    true,
    defaultNonRefundableBps:        30,
    defaultInitialPaymentBps:       10,
    defaultTrancheBps:              30,
    paymentDueOffsetDays:           10,
    paymentDeadlineOffsetDays:      5,
    cancellationCutoffDays:         15,
    refundBpsBeforeCutoff:          70,
    refundBpsAfterCutoff:           0,
    allowDelayedPayment:            false,
    defaultDelayedPaymentDays:      30,
    allowOnlineTranche:             false,
    defaultOnlineTrancheBps:        50,
    defaultOnlineTrancheOffsetDays: 15,
    allowRefundClaim:               false,
    refundClaimWindowDays:          14,
    refundClaimBps:                 100,
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
