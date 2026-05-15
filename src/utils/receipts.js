import { parseUnits, formatUnits, keccak256, toHex, decodeEventLog } from 'viem'
import {
  ARCPROOF_ADDRESS, USDC_ADDRESS, USDC_DECIMALS,
  USDC_SYMBOL, ARCSCAN_BASE,
} from '../config.js'
import ArcProofABI from '../abis/ArcProof.json'
import ERC20ABI    from '../abis/ERC20.json'
import { getPublicClient, getWalletClient } from './wallet.js'
import { cacheTxHash, getCachedTxHash } from './paymentRequest.js'

export function computeMetadataHash(desc, note, merchantName) {
  const text = `${desc || ''}|${note || ''}|${merchantName || ''}`
  if (!text.trim() || text === '||') return '0x' + '0'.repeat(64)
  return keccak256(toHex(text))
}

export function formatUsdc(rawAmount) {
  return parseFloat(formatUnits(rawAmount, USDC_DECIMALS)).toFixed(2)
}

export function formatUsdcFull(rawAmount) {
  return parseFloat(formatUnits(rawAmount, USDC_DECIMALS)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
    useGrouping: false,
  })
}

export function formatTs(unixTs) {
  return new Date(Number(unixTs) * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

export async function getUsdcBalance(account) {
  const pc  = getPublicClient()
  const raw = await pc.readContract({
    address: USDC_ADDRESS, abi: ERC20ABI,
    functionName: 'balanceOf', args: [account],
  })
  return formatUsdc(raw)
}

export async function approveUsdc(account, amountHuman) {
  const pc  = getPublicClient()
  const wc  = getWalletClient()
  const amt = parseUnits(amountHuman.toString(), USDC_DECIMALS)
  const { request } = await pc.simulateContract({
    address: USDC_ADDRESS, abi: ERC20ABI,
    functionName: 'approve', args: [ARCPROOF_ADDRESS, amt], account,
  })
  const tx = await wc.writeContract(request)
  await pc.waitForTransactionReceipt({ hash: tx })
  return tx
}

export async function executePayment({ account, payee, amountHuman, paymentRef, purposeCode, metadataHash }) {
  const pc  = getPublicClient()
  const wc  = getWalletClient()
  const amt = parseUnits(amountHuman.toString(), USDC_DECIMALS)
  const { request } = await pc.simulateContract({
    address: ARCPROOF_ADDRESS, abi: ArcProofABI,
    functionName: 'payAndCreateProof',
    args: [USDC_ADDRESS, payee, amt, paymentRef, purposeCode, metadataHash],
    account,
  })
  const txHash  = await wc.writeContract(request)
  const receipt = await pc.waitForTransactionReceipt({ hash: txHash })

  // Extract proofId from ProofCreated event
  let proofId = null
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: ArcProofABI, data: log.data, topics: log.topics, eventName: 'ProofCreated' })
      if (decoded.eventName === 'ProofCreated') {
        proofId = Number(decoded.args.proofId)
        break
      }
    } catch {}
  }
  if (proofId === null) throw new Error('ProofCreated event not found in receipt')
  cacheTxHash(proofId, txHash)
  return { txHash, proofId, receipt }
}

export async function fetchProof(proofId) {
  const pc = getPublicClient()
  const exists = await pc.readContract({
    address: ARCPROOF_ADDRESS, abi: ArcProofABI,
    functionName: 'proofExists', args: [BigInt(proofId)],
  })
  if (!exists) return null
  return await pc.readContract({
    address: ARCPROOF_ADDRESS, abi: ArcProofABI,
    functionName: 'getProof', args: [BigInt(proofId)],
  })
}

export async function fetchReceivedProofIds(merchantWallet) {
  const pc = getPublicClient()
  return await pc.readContract({
    address: ARCPROOF_ADDRESS, abi: ArcProofABI,
    functionName: 'getProofsReceived', args: [merchantWallet],
  })
}

export async function recoverTxHash(proofId, createdBlock) {
  if (!createdBlock || createdBlock === 0n) return null
  try {
    const pc   = getPublicClient()
    const logs = await pc.getLogs({
      address:   ARCPROOF_ADDRESS,
      event:     ArcProofABI.find(x => x.type === 'event' && x.name === 'ProofCreated'),
      args:      { proofId: BigInt(proofId) },
      fromBlock: BigInt(createdBlock),
      toBlock:   BigInt(createdBlock),
    })
    return logs.length > 0 ? logs[0].transactionHash : null
  } catch { return null }
}

export function buildReceiptObject({ proofData, txHash, proofId, merchantName, description }) {
  const isUsdc = proofData.token?.toLowerCase() === USDC_ADDRESS.toLowerCase()
  return {
    arcpay_version:   'v0.1-testnet',
    receipt_id:       proofId.toString(),
    merchant_wallet:  proofData.payee,
    merchant_name:    merchantName || 'Not available — frontend-only metadata not stored on-chain',
    customer_wallet:  proofData.payer,
    token_address:    proofData.token,
    token_symbol:     isUsdc ? USDC_SYMBOL : proofData.token,
    amount:           formatUsdcFull(proofData.amount),
    payment_ref:      proofData.paymentRef,
    purpose_code:     proofData.purposeCode,
    description:      description || 'Not available — frontend-only metadata not stored on-chain',
    metadata_hash:    proofData.metadataHash,
    timestamp_utc:    formatTs(proofData.timestamp),
    created_block:    proofData.createdBlock?.toString() ?? null,
    transaction_hash: txHash ?? null,
    arcscan_link:     txHash ? `${ARCSCAN_BASE}/tx/${txHash}` : `${ARCSCAN_BASE}/address/${proofData.payee}`,
    receipt_page:     `${typeof window !== 'undefined' ? window.location.origin : ''}/receipt/${proofId}`,
    network:          'Arc Testnet (Chain ID: 5042002)',
    contract_address: ARCPROOF_ADDRESS,
    status:           'CONFIRMED',
    disclaimer:       'TESTNET ONLY. Testnet tokens have no real economic value. This is not a financial instrument or tax document. ArcPay does not perform AML, KYC, or risk scoring.',
  }
}
