import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { decodePaymentRequest } from '../utils/paymentRequest.js'
import { computeMetadataHash, approveUsdc, executePayment, getUsdcBalance } from '../utils/receipts.js'
import { shortAddress } from '../utils/wallet.js'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount } from 'wagmi'
import PaymentCard from '../components/PaymentCard.jsx'
import QRCodeBox from '../components/QRCodeBox.jsx'
import { createDelayedCommitment, createTrancheCommitment } from '../utils/commitment.js'
import { isCommitmentContractConfigured } from '../config.js'

export default function CheckoutPage() {
  const [params]   = useSearchParams()
  const navigate   = useNavigate()
  const [req,      setReq]      = useState(null)
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const account = isConnected ? address : null
  const [balance,  setBalance]  = useState(null)
  const [step,     setStep]     = useState('idle')
  const [error,    setError]    = useState('')
  const [connecting, setConnecting] = useState(false)
  const [payMethod, setPayMethod]   = useState('usdc')

  useEffect(() => {
    const r = params.get('r')
    if (r) {
      const decoded = decodePaymentRequest(r)
      if (decoded) setReq(decoded)
      else setError('Invalid payment request. The link may be corrupted.')
    } else {
      const merchant = params.get('merchant')
      const amount   = params.get('amount')
      const ref      = params.get('ref')
      const purpose  = params.get('purpose') || 'OTHER'
      const name     = params.get('name')    || ''
      const desc     = params.get('desc')    || ''
      if (merchant && amount && ref) {
        setReq({ merchant, amount, ref, purpose, name, desc, note: '' })
      } else {
        setError('Missing payment request parameters.')
      }
    }
  }, [params])

  useEffect(() => {
    if (isConnected && address) {
      getUsdcBalance(address).then(setBalance).catch(() => {})
    }
  }, [address, isConnected])

  function handleConnect() { open() }

  async function handlePay() {
    if (!account || !req) return
    setError('')
    const metadataHash = computeMetadataHash(req.desc, req.note, req.name)

    // ── Delayed commitment ──
    if (req.type === 'delayed') {
      try {
        setStep('paying')
        const { commitmentId } = await createDelayedCommitment(account, {
          merchant:     req.merchant,
          amount:       req.amount,
          dueDate:      req.dueDate,
          deadline:     req.deadline,
          ref:          req.ref,
          description:  req.desc || '',
          metadataHash,
        })
        // Hard redirect: MetaMask mobile reloads the original URL after signing,
        // so we need window.location instead of React navigate()
        if (commitmentId) {
          window.location.href = `/commitment/${commitmentId}?mode=customer`
        } else {
          window.location.href = '/my-commitments'
        }
      } catch (e) {
        setError(e.message || 'Transaction failed.')
        setStep('idle')
      }
      return
    }

    // ── Tranche commitment ──
    if (req.type === 'tranche') {
      try {
        setStep('paying')
        const { commitmentId } = await createTrancheCommitment(account, {
          merchant:        req.merchant,
          trancheAmounts:  req.tranches.map(t => t.amount),
          trancheDueDates: req.tranches.map(t => t.dueDate),
          trancheDeadlines:req.tranches.map(t => t.deadline),
          ref:             req.ref,
          description:     req.desc || '',
          metadataHash,
        })
        if (commitmentId) {
          window.location.href = `/commitment/${commitmentId}?mode=customer`
        } else {
          window.location.href = '/my-commitments'
        }
      } catch (e) {
        setError(e.message || 'Transaction failed.')
        setStep('idle')
      }
      return
    }

    // ── Immediate payment (default) ──
    try {
      setStep('approving')
      await approveUsdc(account, req.amount)
      setStep('paying')
      const { txHash, proofId } = await executePayment({
        account,
        payee:       req.merchant,
        amountHuman: req.amount,
        paymentRef:  req.ref,
        purposeCode: req.purpose,
        description: req.desc || '',
        metadataHash,
      })
      // Build receipt URL — include refund params from req so ReceiptPage can show refund button
      // even when the merchant's on-chain policy hasn't been saved (known testnet limitation)
      const receiptParams = new URLSearchParams({
        name: req.name || '',
        desc: req.desc || '',
      })
      if (req.allowRefundClaim) {
        receiptParams.set('allowRefundClaim', '1')
        receiptParams.set('refundWindowMin', String(req.refundClaimWindowDays ?? 14))
        receiptParams.set('refundBps', String(req.refundClaimBps ?? 10000))
      }
      window.location.href = `/receipt/${proofId}?${receiptParams.toString()}&mode=customer`
    } catch (e) {
      console.error(e)
      setError(e.message || 'Transaction failed. Check MetaMask and try again.')
      setStep('idle')
    }
  }

  if (error && !req) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 48, maxWidth: 520, margin: '0 auto' }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
      <p style={{ color: 'var(--text2)' }}>{error}</p>
    </div>
  )

  if (!req) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
      <p style={{ color: 'var(--text2)', marginTop: 16 }}>Loading payment request...</p>
    </div>
  )

  const isLoading = step === 'approving' || step === 'paying'
  const pageUrl   = window.location.href

  return (
    <div className="fade-up" style={{ maxWidth: 520, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Payment Request
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px' }}>
          {req.name || shortAddress(req.merchant)}
        </h1>
      </div>

      <PaymentCard
        merchantName={req.name}
        amount={req.amount}
        description={req.desc}
        paymentRef={req.ref}
        purposeCode={req.purpose}
        merchantWallet={req.merchant}
      />

      {/* Payment method selector */}
      {!payMethod && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Select payment method
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 10,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              opacity: 0.35, cursor: 'not-allowed',
            }}>
              <div style={{ fontSize: 22 }}>💳</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text3)' }}>Credit / Debit Card</div>
            </div>
            <div
              onClick={() => setPayMethod('usdc')}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 10,
                background: '#0a1628', border: '2px solid var(--usdc)',
                cursor: 'pointer',
              }}>
              <div style={{ fontSize: 22 }}>◆</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--usdc)' }}>Pay with USDC</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>On-chain · Arc Network · Instant receipt</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--usdc)' }}>{req.amount} USDC</div>
            </div>
          </div>
        </div>
      )}

      {/* USDC payment flow */}
      {payMethod === 'usdc' && (
        <div>
          {isLoading && (
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="spinner" />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {req.type === 'delayed' || req.type === 'tranche' ? 'Signing commitment on-chain...' : step === 'approving' ? 'Step 1/2 — Approving USDC...' : 'Step 2/2 — Sending payment...'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                    {req.type === 'delayed' || req.type === 'tranche' ? 'No USDC transferred now — just your signed commitment' : step === 'approving' ? 'Confirm approve in MetaMask' : 'Confirm payment in MetaMask'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!account ? (
            <button onClick={handleConnect} disabled={connecting} className="btn-primary btn-full" style={{ marginBottom: 16 }}>
              {connecting ? <><span className="spinner" />Connecting...</> : '🔗 Connect Wallet to Pay'}
            </button>
          ) : (
            <div>
              <div style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px', marginBottom: 12,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>Paying from</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{shortAddress(account)}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--usdc)', fontWeight: 600 }}>{balance} USDC</div>
              </div>
              <button onClick={handlePay} disabled={isLoading} className="btn-primary btn-full" style={{ marginBottom: 8 }}>
                {step === 'idle'      && (req.type === 'delayed' ? `📅 Sign delayed payment commitment` : req.type === 'tranche' ? `📊 Sign tranche commitment` : `✅ Pay ${req.amount} USDC`)}
                {step === 'approving' && <><span className="spinner" />Approving USDC...</>}
                {step === 'paying'    && <><span className="spinner" />Processing payment...</>}
              </button>
              <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginBottom: 12 }}>
                {req.type === 'delayed' || req.type === 'tranche' ? '1 MetaMask confirmation — no USDC transferred now' : '2 MetaMask confirmations: approve USDC → send payment'}
              </p>
            </div>
          )}
        </div>
      )}

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ marginTop: 16, padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text2)' }}>TESTNET ONLY.</strong> Testnet tokens have no real economic value.
        Testnet demo only. No custody. Not a production payment service.
      </div>
    </div>
  )
}
