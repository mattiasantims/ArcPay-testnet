import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { QRCodeSVG } from 'qrcode.react'
import {
  fetchProof, formatUsdc, formatTs,
  buildReceiptObject, recoverTxHash,
} from '../utils/receipts.js'
import { getCachedTxHash, getPaymentRequests } from '../utils/paymentRequest.js'
import { shortAddress } from '../utils/wallet.js'
import { ARCSCAN_BASE, USDC_ADDRESS, isMerchantRegistryConfigured, isRefundContractConfigured } from '../config.js'
import { getMerchantByWallet, getMerchantPolicyByWallet } from '../utils/merchant.js'
import {
  requestRefund, directRefund,
  fetchCustomerRefundIds, fetchMerchantRefundIds, fetchRefundRequest,
  fetchRefundTxHashes,
  REFUND_STATUS_LABEL, REFUND_STATUS_COLOR,
} from '../utils/refund.js'
import ReceiptActions from '../components/ReceiptActions.jsx'
import { downloadReceiptPDF, downloadFullReceiptPDF, downloadRefundRequestedPDF, downloadRefundProcessedPDF } from '../utils/pdf.js'

export default function ReceiptPage() {
  const { id }   = useParams()
  const [params] = useSearchParams()
  const { address } = useAccount()
  const { open }    = useWeb3Modal()

  const [proof,           setProof]           = useState(null)
  const [status,          setStatus]          = useState('loading')
  const [txHash,          setTxHash]          = useState(null)
  const [receipt,         setReceipt]         = useState(null)
  const [merchantProfile, setMerchantProfile] = useState(null)
  const [merchantPolicy,  setMerchantPolicy]  = useState(null)
  const [existingRefund,    setExistingRefund]    = useState(null)
  const [refundRequestTx,   setRefundRequestTx]   = useState(null)
  const [refundProcessTx,   setRefundProcessTx]   = useState(null)

  // Customer refund form
  const [showRefund,    setShowRefund]    = useState(false)
  const [refundAmount,  setRefundAmount]  = useState('')
  const [refundReason,  setRefundReason]  = useState('')
  const [refundSending, setRefundSending] = useState(false)
  const [refundSuccess, setRefundSuccess] = useState('')
  const [refundError,   setRefundError]   = useState('')

  // Merchant direct refund form
  const [showDirect,    setShowDirect]    = useState(false)
  const [directAmount,  setDirectAmount]  = useState('')
  const [directReason,  setDirectReason]  = useState('')
  const [directSending, setDirectSending] = useState(false)
  const [directSuccess, setDirectSuccess] = useState('')
  const [directError,   setDirectError]   = useState('')

  // URL metadata
  const urlMerchantName = params.get('name') ? decodeURIComponent(params.get('name')) : null
  const urlDescription = params.get('desc') ? decodeURIComponent(params.get('desc')) : null
  const [description, setDescription] = useState(urlDescription)
  const [merchantNameFallback, setMerchantNameFallback] = useState(null)

  // Refund window params passed by CheckoutPage after immediate payment
  const urlAllowRefund = params.get('allowRefundClaim') === '1'
  const urlWindowMin   = params.get('refundWindowMin') ? Number(params.get('refundWindowMin')) : 14

  const refundContractReady = isRefundContractConfigured()

  // Load proof
  useEffect(() => {
    async function load() {
      setStatus('loading')
      try {
        const data = await fetchProof(id)
        if (!data) { setStatus('notfound'); return }
        setProof(data)
        const cached = getCachedTxHash(id)
        if (cached) setTxHash(cached)
        else if (data.createdBlock && data.createdBlock > 0n) {
          const recovered = await recoverTxHash(id, data.createdBlock)
          if (recovered) setTxHash(recovered)
        }
        setStatus('found')
      } catch { setStatus('error') }
    }
    load()
  }, [id])

  // Fallback: load description + merchantName from localStorage if not in URL
  useEffect(() => {
    if (!proof?.paymentRef) return
    if (description && urlMerchantName) return
    try {
      const reqs = getPaymentRequests() || []
      const r = reqs.find(x => x.ref === proof.paymentRef)
      if (r) {
        if (!description && r.desc) setDescription(r.desc)
        if (!urlMerchantName && r.name) setMerchantNameFallback(r.name)
      }
    } catch {}
  }, [proof?.paymentRef])

  // Load merchant profile + policy
  useEffect(() => {
    if (!proof?.payee || !isMerchantRegistryConfigured()) return
    getMerchantByWallet(proof.payee).then(m => { if (m && m.active) setMerchantProfile(m) }).catch(() => {})
    getMerchantPolicyByWallet(proof.payee).then(p => { if (p) setMerchantPolicy(p) }).catch(() => {})
  }, [proof?.payee])

  // Load existing refund for this proof (by paymentRef match)
  useEffect(() => {
    if (!proof || !refundContractReady || !address) return
    // proofRef stored on-chain is sliced to 64 chars in requestRefund/directRefund — must match exactly
    const proofRef   = (proof.paymentRef || id).slice(0, 64)
    const isCustomer = address.toLowerCase() === proof.payer?.toLowerCase()
    const isMerchant = address.toLowerCase() === proof.payee?.toLowerCase()
    async function findRefund() {
      try {
        const ids = isCustomer
          ? await fetchCustomerRefundIds(address)
          : isMerchant ? await fetchMerchantRefundIds(address) : []
        for (const rid of [...ids].reverse()) {
          const r = await fetchRefundRequest(rid)
          if (r && r.proofRef === proofRef) {
            setExistingRefund(r)
            fetchRefundTxHashes(r).then(({ requestTxHash, processTxHash }) => {
              if (requestTxHash) setRefundRequestTx(requestTxHash)
              if (processTxHash) setRefundProcessTx(processTxHash)
            }).catch(() => {})
            return
          }
        }
      } catch {}
    }
    findRefund()
  }, [proof, address, refundContractReady])

  // Build receipt object
  useEffect(() => {
    if (proof && status === 'found') {
      setReceipt(buildReceiptObject({ proofData: proof, txHash, proofId: id, merchantName: urlMerchantName || merchantNameFallback, description, merchantProfile }))
    }
  }, [proof, txHash, status, merchantProfile, description, merchantNameFallback])

  async function handleRefundRequest() {
    if (!address) { setRefundError('Connect wallet first'); return }
    if (!refundAmount || parseFloat(refundAmount) <= 0) { setRefundError('Amount required'); return }
    if (!refundReason.trim()) { setRefundError('Reason required'); return }
    setRefundSending(true); setRefundError('')
    try {
      const result = await requestRefund(address, {
        merchant: proof.payee,
        amount:   refundAmount,
        proofRef: (proof.paymentRef || id).slice(0, 64),
        reason:   refundReason,
      })
      setRefundSuccess('Refund request submitted on-chain. Merchant will review.')
      setShowRefund(false)
      if (result.refundId) {
        const r = await fetchRefundRequest(result.refundId)
        setExistingRefund(r)
        if (result.hash) setRefundRequestTx(result.hash)
      }
    } catch (e) { setRefundError(e.message || 'Transaction failed') }
    finally { setRefundSending(false) }
  }

  async function handleDirectRefund() {
    if (!address) return
    if (!directAmount || parseFloat(directAmount) <= 0) { setDirectError('Amount required'); return }
    setDirectSending(true); setDirectError('')
    try {
      await directRefund(address, {
        customerWallet: proof.payer,
        amount:         directAmount,
        proofRef:       (proof.paymentRef || id).slice(0, 64),
        reason:         directReason || 'Direct refund',
      })
      setDirectSuccess(`Refund of ${directAmount} USDC sent to customer.`)
      setShowDirect(false)
      // Reload refund status
      const rIds = await fetchMerchantRefundIds(address)
      const proofRef = (proof.paymentRef || id).slice(0, 64)
      for (const rid of [...rIds].reverse()) {
        const r = await fetchRefundRequest(rid)
        if (r && r.proofRef === proofRef) {
          setExistingRefund(r)
          // Load TX hashes for the new direct refund
          fetchRefundTxHashes(r).then(({ requestTxHash, processTxHash }) => {
            if (requestTxHash) setRefundRequestTx(requestTxHash)
            if (processTxHash) setRefundProcessTx(processTxHash)
          }).catch(() => {})
          break
        }
      }
    } catch (e) { setDirectError(e.message || 'Transaction failed') }
    finally { setDirectSending(false) }
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (status === 'loading') return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
      <p style={{ color: 'var(--text2)', marginTop: 16 }}>Loading receipt #{id}...</p>
    </div>
  )
  if (status === 'notfound') return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
      <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, marginBottom: 8 }}>Receipt not found</h2>
      <p style={{ color: 'var(--text2)', fontSize: 14 }}>Receipt #{id} does not exist on Arc Testnet.</p>
    </div>
  )
  if (status === 'error') return (
    <div className="error-box fade-up" style={{ padding: 24 }}>Failed to load receipt. Check your connection.</div>
  )

  const receiptUrl = window.location.href
  const isUsdc     = proof.token?.toLowerCase() === USDC_ADDRESS.toLowerCase()
  const isCustomer = !!address && address.toLowerCase() === proof.payer?.toLowerCase()
  const isMerchant = !!address && address.toLowerCase() === proof.payee?.toLowerCase()

  // Refund window: merchantPolicy (on-chain) OR URL param (passed by CheckoutPage) OR default 14 min
  const windowMin      = merchantPolicy?.refundClaimWindowDays ?? urlWindowMin
  const paymentTimeMs  = proof.timestamp ? Number(proof.timestamp) * 1000 : null
  const withinWindow   = !paymentTimeMs || (Date.now() - paymentTimeMs) <= windowMin * 60 * 1000
  const windowClosedAt = paymentTimeMs ? new Date(paymentTimeMs + windowMin * 60 * 1000) : null
  // Show refund actions when: contract ready AND (on-chain policy OR URL flag)
  // Show refund actions for any payment — no allowRefundClaim gate on the UI
  const refundEnabled  = refundContractReady

  const refundColor = existingRefund ? (REFUND_STATUS_COLOR[existingRefund.status] || 'var(--text3)') : null
  const refundLabel = existingRefund ? REFUND_STATUS_LABEL[existingRefund.status] : null

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-green">✓ Verified on-chain</span>
          <span className="badge badge-blue">Arc Testnet</span>
          {existingRefund && (
            <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700,
              background: refundColor + '22', color: refundColor, border: `1px solid ${refundColor}44` }}>
              Refund: {refundLabel}
            </span>
          )}
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.5px' }}>
          {proof.paymentRef ? `Payment Receipt · ${proof.paymentRef}` : 'Payment Receipt'}
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>
          Verified on Arc · Payment and receipt created in the same transaction.
        </p>
      </div>

      {/* Amount */}
      <div className="card" style={{ textAlign: 'center', padding: '32px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Amount paid</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 52, fontWeight: 800, color: 'var(--usdc)', letterSpacing: '-2px', lineHeight: 1 }}>
          {formatUsdc(proof.amount)}
        </div>
        <div style={{ fontSize: 18, color: 'var(--text2)', marginTop: 6, fontWeight: 500 }}>
          {isUsdc ? 'USDC' : proof.token}
        </div>
        {proof.timestamp && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text2)' }}>{formatTs(proof.timestamp)}</div>
        )}
        {(urlMerchantName || merchantNameFallback || proof.paymentRef) && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {(urlMerchantName || merchantNameFallback) && <span className="badge badge-gray">{urlMerchantName || merchantNameFallback}</span>}
            {proof.paymentRef && <span className="badge badge-blue">{proof.paymentRef}</span>}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="card" style={{ marginBottom: 16 }}>
        {[
          { k: 'Payment Ref',       v: proof.paymentRef,   mono: true },
          { k: 'Purpose',           v: proof.purposeCode,  mono: true },
          { k: 'Description',       v: proof?.description || description || '—' },
          { k: 'Merchant wallet',   v: proof.payee,        mono: true, full: true },
          { k: 'Trading name',      v: merchantProfile?.tradingName || urlMerchantName || merchantNameFallback || '—' },
          { k: 'Legal name',        v: merchantProfile?.legalName || '—' },
          { k: 'Country',           v: merchantProfile?.country || '—' },
          { k: 'Registered office', v: merchantProfile?.businessAddress || '—' },
          { k: 'VAT / Company ID',  v: merchantProfile?.vatOrCompanyId || '—' },
          { k: 'LEI',               v: merchantProfile?.lei || '—' },
          { k: 'Customer',          v: proof.payer,        mono: true, full: true },
          { k: 'Token',             v: isUsdc ? 'USDC (Circle)' : proof.token },
          { k: 'Metadata hash',     v: proof.metadataHash, mono: true, full: true },
          { k: 'Block',             v: proof.createdBlock?.toString() ?? '—', mono: true },
          { k: 'Timestamp',         v: formatTs(proof.timestamp) },
          { k: 'Network',           v: 'Arc Testnet · Chain ID 5042002' },
        ].map((row, i, arr) => (
          <div key={row.k} className="field-row" style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span className="field-key">{row.k}</span>
            <span className={`field-val${row.mono ? '' : ' normal'}`} style={{ fontSize: row.full ? 11 : undefined }}>{row.v}</span>
          </div>
        ))}
        <div className="field-row" style={{ borderBottom: 'none' }}>
          <span className="field-key">TX Hash</span>
          {txHash
            ? <a href={`${ARCSCAN_BASE}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', textAlign: 'right', wordBreak: 'break-all' }}>{txHash}</a>
            : <a href={`${ARCSCAN_BASE}/address/${proof.payee}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--accent)' }}>View merchant on ArcScan ↗</a>
          }
        </div>
      </div>

      {/* Actions */}
      {receipt && <div style={{ marginBottom: 16 }}><ReceiptActions receipt={receipt} /></div>}

      {/* ── Available Actions (refund) ── */}
      {refundEnabled && (isCustomer || isMerchant) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Available Actions
          </div>

          {/* Window closed message */}
          {!withinWindow && !existingRefund && (
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>
              Refund window closed{windowClosedAt ? ` — expired ${windowClosedAt.toLocaleString()}` : ''}.
            </p>
          )}

          {/* Existing refund status */}
          {existingRefund && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Refund:</span>
              <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, fontWeight: 700,
                background: refundColor + '22', color: refundColor, border: `1px solid ${refundColor}44` }}>
                {refundLabel}
              </span>
              <span style={{ fontSize: 12, color: 'var(--usdc)', fontWeight: 600 }}>{existingRefund.amount} USDC</span>
              {existingRefund.reason && <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>"{existingRefund.reason}"</span>}
            </div>
          )}

          {/* Customer: request refund */}
          {isCustomer && withinWindow && !existingRefund && (
            <>
              {refundSuccess && <div className="success-box" style={{ marginBottom: 8 }}>{refundSuccess}</div>}
              {!showRefund ? (
                <button onClick={() => setShowRefund(true)} className="btn-ghost"
                  style={{ fontSize: 13, padding: '8px 16px', borderColor: 'var(--yellow)', color: 'var(--yellow)' }}>
                  💸 Request refund from merchant
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {!address && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>Connect wallet to sign</span>
                      <button onClick={() => open()} className="btn-primary" style={{ fontSize: 11, padding: '5px 14px' }}>Connect</button>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="label">Amount to claim (USDC)</label>
                      <input type="number" min="0.01" step="0.01" value={refundAmount}
                        onChange={e => setRefundAmount(e.target.value)} placeholder={receipt?.amount || ''} />
                    </div>
                    <div>
                      <label className="label">Reason</label>
                      <input value={refundReason} onChange={e => setRefundReason(e.target.value)}
                        placeholder="e.g. Item not as described" />
                    </div>
                  </div>
                  {refundError && <div className="error-box">{refundError}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleRefundRequest} disabled={refundSending || !address}
                      className="btn-primary" style={{ fontSize: 12, padding: '8px 16px' }}>
                      {refundSending ? <><span className="spinner" />Sending...</> : '📤 Submit refund request'}
                    </button>
                    <button onClick={() => { setShowRefund(false); setRefundError('') }}
                      className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }}>Cancel</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Merchant: approve/deny pending request */}
          {isMerchant && existingRefund && existingRefund.status === 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: existingRefund ? 8 : 0 }}>
              <button onClick={async () => {
                try {
                  const { approveRefund } = await import('../utils/refund.js')
                  await approveRefund(address, existingRefund.refundId)
                  const r = await fetchRefundRequest(existingRefund.refundId)
                  setExistingRefund(r)
                  fetchRefundTxHashes(r).then(({ requestTxHash, processTxHash }) => {
                    if (requestTxHash) setRefundRequestTx(requestTxHash)
                    if (processTxHash) setRefundProcessTx(processTxHash)
                  }).catch(() => {})
                } catch (e) { setDirectError(e.message || 'Approve failed') }
              }} className="btn-primary" style={{ fontSize: 12, padding: '8px 16px', background: 'var(--green)', border: 'none' }}>
                ✓ Approve refund
              </button>
              <button onClick={async () => {
                try {
                  const { denyRefund } = await import('../utils/refund.js')
                  await denyRefund(address, existingRefund.refundId)
                  const r = await fetchRefundRequest(existingRefund.refundId)
                  setExistingRefund(r)
                  fetchRefundTxHashes(r).then(({ requestTxHash, processTxHash }) => {
                    if (requestTxHash) setRefundRequestTx(requestTxHash)
                    if (processTxHash) setRefundProcessTx(processTxHash)
                  }).catch(() => {})
                } catch (e) { setDirectError(e.message || 'Deny failed') }
              }} style={{ fontSize: 12, padding: '8px 16px', background: '#1a0808', border: '1px solid #f04f4f', color: '#f08080', borderRadius: 8, cursor: 'pointer' }}>
                ✕ Deny
              </button>
            </div>
          )}

          {/* Merchant: direct refund (within window) */}
          {isMerchant && withinWindow && (
            <div style={{ marginTop: 12 }}>
              {directSuccess ? (
                <div className="success-box">{directSuccess}</div>
              ) : !showDirect ? (
                <button onClick={() => setShowDirect(true)} className="btn-ghost"
                  style={{ fontSize: 13, padding: '8px 16px', borderColor: 'var(--green)', color: 'var(--green)' }}>
                  💸 Issue direct refund to customer
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    Off-chain agreed refund — transfers USDC directly to customer.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="label">Amount (USDC)</label>
                      <input type="number" min="0.01" step="0.01" value={directAmount}
                        onChange={e => setDirectAmount(e.target.value)} placeholder={receipt?.amount || ''} />
                    </div>
                    <div>
                      <label className="label">Reason</label>
                      <input value={directReason} onChange={e => setDirectReason(e.target.value)}
                        placeholder="e.g. Agreed refund — phone call" />
                    </div>
                  </div>
                  {directError && <div className="error-box">{directError}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleDirectRefund} disabled={directSending} className="btn-primary"
                      style={{ fontSize: 12, padding: '8px 16px', background: 'var(--green)', border: 'none' }}>
                      {directSending ? <><span className="spinner" />Sending...</> : '✓ Send refund'}
                    </button>
                    <button onClick={() => { setShowDirect(false); setDirectError('') }}
                      className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isCustomer && !isMerchant && (
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>Connect the customer or merchant wallet to take action.</p>
          )}
        </div>
      )}

      {/* ── Receipts & Events ── */}
      {proof && (
        <div className="card" style={{ marginBottom: 16, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Receipts & Events
          </div>

          {/* Build events list */}
          {(() => {
            const events = []

            // Event 1: Payment
            events.push({
              label:     'Payment',
              txHash:    txHash,
              timestamp: proof.timestamp ? new Date(Number(proof.timestamp) * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC' : null,
              detail:    `${formatUsdc(proof.amount)} USDC · ${proof.paymentRef || ''}`,
              pdf:       () => downloadReceiptPDF(receipt),
            })

            // Event 2+: Refund events
            if (existingRefund) {
              const ARCSCAN = 'https://testnet.arcscan.app'
              if (existingRefund.requestedAt) {
                events.push({
                  label:     'Refund Requested',
                  txHash:    refundRequestTx,
                  timestamp: new Date(existingRefund.requestedAt * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC',
                  detail:    `${existingRefund.amount} USDC${existingRefund.reason ? ' · "' + existingRefund.reason + '"' : ''}`,
                  note:      existingRefund.reason || null,
                  pdf:       () => downloadRefundRequestedPDF(receipt, existingRefund, refundRequestTx),
                })
              }
              if (existingRefund.status === 1) {
                events.push({
                  label:     'Refund Approved',
                  txHash:    refundProcessTx,
                  timestamp: existingRefund.processedAt ? new Date(existingRefund.processedAt * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC' : null,
                  detail:    `${existingRefund.amount} USDC transferred from merchant to customer`,
                  note:      null,
                  pdf:       () => downloadRefundProcessedPDF(receipt, existingRefund, refundProcessTx, 'Approved'),
                })
              }
              if (existingRefund.status === 2) {
                events.push({
                  label:     'Refund Denied',
                  txHash:    refundProcessTx,
                  timestamp: existingRefund.processedAt ? new Date(existingRefund.processedAt * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC' : null,
                  detail:    'Merchant denied the refund request',
                  note:      null,
                  pdf:       () => downloadRefundProcessedPDF(receipt, existingRefund, refundProcessTx, 'Denied'),
                })
              }
              if (existingRefund.status === 3) {
                events.push({
                  label:     'Direct Refund',
                  txHash:    refundProcessTx,
                  timestamp: existingRefund.processedAt ? new Date(existingRefund.processedAt * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC' : null,
                  detail:    `${existingRefund.amount} USDC sent directly by merchant`,
                  note:      existingRefund.reason || null,
                  pdf:       () => downloadRefundProcessedPDF(receipt, existingRefund, refundProcessTx, existingRefund.status),
                })
              }
            }

            return (
              <>
                {/* Event rows */}
                <div style={{ marginBottom: 14 }}>
                  {events.map((ev, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      padding: '10px 0', borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none',
                      flexWrap: 'wrap', gap: 8,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{ev.label}</div>
                        {ev.detail && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{ev.detail}</div>}
                        {ev.note  && <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>Note: "{ev.note}"</div>}
                        {ev.timestamp && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{ev.timestamp}</div>}
                        {ev.txHash && (
                          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 3, wordBreak: 'break-all' }}>
                            TX: {ev.txHash}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                        {ev.label === 'Payment' && (
                          <button onClick={() => receipt && downloadReceiptPDF(receipt)} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
                            🖨️ PDF
                          </button>
                        )}
                        {ev.label === 'Refund Requested' && existingRefund && (
                          <button onClick={() => downloadRefundRequestedPDF(receipt, existingRefund, refundRequestTx)} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
                            🖨️ PDF
                          </button>
                        )}
                        {(ev.label === 'Refund Approved' || ev.label === 'Refund Denied' || ev.label === 'Direct Refund') && existingRefund && (
                          <button onClick={() => ev.pdf ? ev.pdf() : downloadRefundProcessedPDF(receipt, existingRefund, refundProcessTx, existingRefund.status)} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
                            🖨️ PDF
                          </button>
                        )}
                        {ev.txHash ? (
                          <a href={`${ARCSCAN_BASE}/tx/${ev.txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                            <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>ArcScan ↗</button>
                          </a>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text3)', padding: '4px 0', fontStyle: 'italic' }}>recovering TX...</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Download buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => downloadFullReceiptPDF(receipt, events)}
                    className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                    🖨️ Full PDF (all events)
                  </button>
                  <button
                    onClick={() => downloadReceiptPDF(receipt)}
                    className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                    🖨️ Payment PDF
                  </button>
                  {existingRefund && existingRefund.status !== 3 && (
                    <button
                      onClick={() => downloadRefundRequestedPDF(receipt, existingRefund, refundRequestTx)}
                      className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                      🖨️ Refund Request PDF
                    </button>
                  )}
                  {existingRefund && (existingRefund.status === 1 || existingRefund.status === 2) && (
                    <button
                      onClick={() => downloadRefundProcessedPDF(receipt, existingRefund, refundProcessTx, existingRefund.status)}
                      className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                      🖨️ {existingRefund.status === 1 ? 'Refund Approved' : 'Refund Denied'} PDF
                    </button>
                  )}
                  {existingRefund && existingRefund.status === 3 && (
                    <button
                      onClick={() => downloadRefundProcessedPDF(receipt, existingRefund, refundProcessTx, existingRefund.status)}
                      className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                      🖨️ Direct Refund PDF
                    </button>
                  )}
                  {txHash && (
                    <a href={`${ARCSCAN_BASE}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                      <button className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>Payment TX ↗</button>
                    </a>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* QR */}
      <div className="card" style={{ padding: 28, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Share this receipt
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: '#fff', padding: 16, borderRadius: 12 }}>
            <QRCodeSVG value={receiptUrl} size={160} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>{receiptUrl}</p>
        </div>
      </div>

      <div style={{ padding: 14, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text2)' }}>TESTNET ONLY.</strong> Testnet tokens have no real economic value.
        This is not a financial instrument, tax document, or compliance record.
      </div>
    </div>
  )
}
