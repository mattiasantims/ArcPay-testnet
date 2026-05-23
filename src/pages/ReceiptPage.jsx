import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { QRCodeSVG } from 'qrcode.react'
import {
  fetchProof, formatUsdc, formatTs,
  buildReceiptObject, recoverTxHash,
} from '../utils/receipts.js'
import { getCachedTxHash, decodePaymentRequest } from '../utils/paymentRequest.js'
import { shortAddress } from '../utils/wallet.js'
import { ARCSCAN_BASE, USDC_ADDRESS, isMerchantRegistryConfigured, isRefundContractConfigured } from '../config.js'
import { getMerchantByWallet, getMerchantPolicyByWallet } from '../utils/merchant.js'
import { requestRefund } from '../utils/refund.js'
import ReceiptActions from '../components/ReceiptActions.jsx'

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
  const [showRefund,      setShowRefund]       = useState(false)
  const [refundAmount,    setRefundAmount]     = useState('')
  const [refundReason,    setRefundReason]     = useState('')
  const [refundSending,   setRefundSending]    = useState(false)
  const [refundSuccess,   setRefundSuccess]    = useState('')
  const [refundError,     setRefundError]      = useState('')

  // Optional frontend-only metadata from URL
  const merchantName = params.get('name') ? decodeURIComponent(params.get('name')) : null
  const description  = params.get('desc') ? decodeURIComponent(params.get('desc')) : null

  // Decode full payment request from ?r= param (luxury flow encodes allowRefundClaim here)
  const urlReq = (() => {
    const r = params.get('r')
    if (!r) return null
    try { return decodePaymentRequest(r) } catch { return null }
  })()

  // Effective refund policy: prefer on-chain (merchantPolicy), fall back to URL-encoded req
  // This is the workaround for the "policy non persiste" known bug.
  const effectiveRefundEnabled = !!(
    merchantPolicy?.allowRefundClaim ||
    urlReq?.allowRefundClaim
  )
  const effectiveWindowDays = merchantPolicy?.refundClaimWindowDays ?? urlReq?.refundClaimWindowDays ?? 14
  const effectiveBps        = merchantPolicy?.refundClaimBps        ?? urlReq?.refundClaimBps        ?? 10000

  useEffect(() => {
    async function load() {
      setStatus('loading')
      try {
        const data = await fetchProof(id)
        if (!data) { setStatus('notfound'); return }
        setProof(data)

        const cached = getCachedTxHash(id)
        if (cached) {
          setTxHash(cached)
        } else if (data.createdBlock && data.createdBlock > 0n) {
          const recovered = await recoverTxHash(id, data.createdBlock)
          if (recovered) setTxHash(recovered)
        }

        setStatus('found')
      } catch (e) {
        console.error(e)
        setStatus('error')
      }
    }
    load()
  }, [id])

  // Load merchant profile + on-chain policy
  useEffect(() => {
    if (!proof?.payee || !isMerchantRegistryConfigured()) return
    getMerchantByWallet(proof.payee).then(m => {
      if (m && m.active) setMerchantProfile(m)
    }).catch(() => {})
    getMerchantPolicyByWallet(proof.payee).then(p => {
      if (p) setMerchantPolicy(p)
    }).catch(() => {})
  }, [proof?.payee])

  async function handleRefundRequest() {
    // Determine payer: use connected wallet if matches proof.payer, else use proof.payer directly
    const payerAddress = address || proof?.payer
    if (!payerAddress) { setRefundError('Connect wallet first'); return }
    if (!refundAmount || parseFloat(refundAmount) <= 0) { setRefundError('Amount required'); return }
    if (!refundReason.trim()) { setRefundError('Reason required'); return }
    setRefundSending(true); setRefundError('')
    try {
      const expiresAt = Date.now() + effectiveWindowDays * 60 * 1000
      await requestRefund(payerAddress, {
        merchant:  proof.payee,
        amount:    refundAmount,
        proofRef:  proof.paymentRef || id,
        reason:    refundReason,
        expiresAt,
      })
      setRefundSuccess('Refund request submitted on-chain. Merchant will review.')
      setShowRefund(false)
    } catch (e) {
      setRefundError(e.message || 'Transaction failed')
    } finally {
      setRefundSending(false)
    }
  }

  useEffect(() => {
    if (proof && status === 'found') {
      const r = buildReceiptObject({
        proofData:      proof,
        txHash,
        proofId:        id,
        merchantName,
        description,
        merchantProfile,
      })
      setReceipt(r)
    }
  }, [proof, txHash, status])

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
    <div className="error-box fade-up" style={{ padding: 24 }}>
      Failed to load receipt. Check your network connection.
    </div>
  )

  const receiptUrl = window.location.href
  const isUsdc     = proof.token?.toLowerCase() === USDC_ADDRESS.toLowerCase()

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span className="badge badge-green">✓ Verified on-chain</span>
          <span className="badge badge-blue">Arc Testnet</span>
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
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text2)' }}>
            {formatTs(proof.timestamp)}
          </div>
        )}
        {(merchantName || proof.paymentRef) && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {merchantName && <span className="badge badge-gray">{merchantName}</span>}
            {proof.paymentRef && <span className="badge badge-blue">{proof.paymentRef}</span>}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="card" style={{ marginBottom: 16 }}>
        {[
          { k: 'Payment Ref',   v: proof.paymentRef,   mono: true },
          { k: 'Purpose',       v: proof.purposeCode,  mono: true },
          { k: 'Description',   v: proof?.description || description || '—' },
          { k: 'Merchant wallet', v: proof.payee,        mono: true, full: true },
          { k: 'Trading name',    v: merchantProfile?.tradingName || merchantName || '—' },
          { k: 'Legal name',      v: merchantProfile?.legalName || '—' },
          { k: 'Country',         v: merchantProfile?.country || '—' },
          { k: 'Registered office', v: merchantProfile?.businessAddress || '—' },
          { k: 'VAT / Company ID',  v: merchantProfile?.vatOrCompanyId || '—' },
          { k: 'LEI',             v: merchantProfile?.lei || '—' },
          { k: 'Customer',        v: proof.payer,        mono: true, full: true },
          { k: 'Token',         v: isUsdc ? 'USDC (Circle)' : proof.token },
          { k: 'Metadata hash', v: proof.metadataHash, mono: true, full: true },
          { k: 'Block',         v: proof.createdBlock?.toString() ?? '—', mono: true },
          { k: 'Timestamp',     v: formatTs(proof.timestamp) },
          { k: 'Network',       v: 'Arc Testnet · Chain ID 5042002' },
        ].map((row, i, arr) => (
          <div key={row.k} className="field-row" style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span className="field-key">{row.k}</span>
            <span className={`field-val${row.mono ? '' : ' normal'}`} style={{ fontSize: row.full ? 11 : undefined }}>
              {row.v}
            </span>
          </div>
        ))}
        {/* TX Hash */}
        <div className="field-row" style={{ borderBottom: 'none' }}>
          <span className="field-key">TX Hash</span>
          {txHash ? (
            <a href={`${ARCSCAN_BASE}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', textAlign: 'right', wordBreak: 'break-all' }}>
              {txHash}
            </a>
          ) : (
            <a href={`${ARCSCAN_BASE}/address/${proof.payee}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'var(--accent)' }}>
              View merchant on ArcScan ↗
            </a>
          )}
        </div>
      </div>

      {/* Actions */}
      {receipt && (
        <div style={{ marginBottom: 16 }}>
          <ReceiptActions receipt={receipt} />
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
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
            {receiptUrl}
          </p>
        </div>
      </div>

      {/* ── Refund claim ─────────────────────────────────────────────────────── */}
      {/* Shows when: refund contract deployed AND (on-chain policy OR URL flag) */}
      {isRefundContractConfigured() && effectiveRefundEnabled && proof && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>💸 Request Refund</div>
          {refundSuccess ? (
            <div className="success-box">{refundSuccess}</div>
          ) : !showRefund ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => setShowRefund(true)}
                className="btn-ghost"
                style={{ fontSize: 13, padding: '8px 16px', borderColor: 'var(--yellow)', color: 'var(--yellow)', width: 'fit-content' }}
              >
                Request refund from merchant
              </button>
              {!address && (
                <p style={{ fontSize: 12, color: 'var(--text3)' }}>
                  You'll need to connect your wallet to sign the refund request.{' '}
                  <button onClick={() => open()} className="btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}>Connect</button>
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                Merchant has up to {effectiveWindowDays} min to respond. Max refundable: {Math.round(effectiveBps / 100)}% of payment.
              </div>
              {!address && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>Connect wallet to sign</span>
                  <button onClick={() => open()} className="btn-primary" style={{ fontSize: 11, padding: '5px 14px' }}>Connect</button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">Amount to claim (USDC)</label>
                  <input
                    type="number" min="0.01" step="0.01"
                    value={refundAmount}
                    onChange={e => setRefundAmount(e.target.value)}
                    placeholder={receipt?.amount || ''}
                  />
                </div>
                <div>
                  <label className="label">Reason</label>
                  <input
                    value={refundReason}
                    onChange={e => setRefundReason(e.target.value)}
                    placeholder="e.g. Item not as described"
                  />
                </div>
              </div>
              {refundError && <div className="error-box">{refundError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleRefundRequest}
                  disabled={refundSending || !address}
                  className="btn-primary"
                  style={{ fontSize: 12, padding: '8px 16px' }}
                >
                  {refundSending ? <><span className="spinner" />Sending...</> : '📤 Submit refund request'}
                </button>
                <button
                  onClick={() => { setShowRefund(false); setRefundError('') }}
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: '8px 14px' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ padding: 14, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text2)' }}>TESTNET ONLY.</strong> Testnet tokens have no real economic value.
        This is not a financial instrument, tax document, or compliance record.
        ArcPay does not perform AML, KYC, or risk scoring.
      </div>
    </div>
  )
}
