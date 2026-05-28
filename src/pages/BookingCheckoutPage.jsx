import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { decodeBookingRequest } from '../utils/bookingRequest.js'
import { computeBookingMetadataHash, approveUsdcForBooking, executeCreateBooking } from '../utils/booking.js'
import { shortAddress } from '../utils/wallet.js'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount } from 'wagmi'
import { getUsdcBalance } from '../utils/receipts.js'
import { isBookingContractConfigured } from '../config.js'
import BookingPolicyCard from '../components/BookingPolicyCard.jsx'

export default function BookingCheckoutPage() {
  const [params]   = useSearchParams()
  const navigate   = useNavigate()
  const [req,      setReq]        = useState(null)
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const account = isConnected ? address : null
  const [balance,  setBalance]    = useState(null)
  const [step,     setStep]       = useState('idle')
  const [error,    setError]      = useState('')
  const [connecting, setConnecting] = useState(false)
  const [payMethod,  setPayMethod]  = useState('usdc') // always usdc
  const configured = isBookingContractConfigured()

  useEffect(() => {
    const r = params.get('r')
    if (r) {
      const decoded = decodeBookingRequest(r)
      if (decoded) setReq(decoded)
      else setError('Invalid booking request. The link may be corrupted.')
    } else {
      setError('Missing booking request parameters.')
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
    const metadataHash = computeBookingMetadataHash(
      req.merchantName, req.description, req.note,
      req.bookingRef, req.checkInDate, req.cancellationDeadline
    )
    try {
      setStep('approving')
      await approveUsdcForBooking(account, req.totalAmount)
      setStep('paying')
      const { bookingId } = await executeCreateBooking({
        account,
        merchant:             req.merchant,
        totalAmountHuman:     req.totalAmount,
        nonRefundableBps:     req.nonRefundableBps,
        cancellationDeadline: req.cancellationDeadline,
        checkInDate:          req.checkInDate,
        bookingRef:           req.bookingRef,
        description:          req.description || '',
        metadataHash,
      })
      window.location.href = `/booking/${bookingId}?name=${encodeURIComponent(req.merchantName||'')}&desc=${encodeURIComponent(req.description||'')}&mode=customer`
    } catch (e) {
      console.error(e)
      setError(e.message || 'Transaction failed.')
      setStep('idle')
    }
  }

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--yellow)' }}>Booking escrow contract not configured.</p>
    </div>
  )

  if (error && !req) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
      <p style={{ color: 'var(--text2)' }}>{error}</p>
    </div>
  )

  if (!req) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
    </div>
  )

  const bps    = parseInt(req.nonRefundableBps || 3000)
  const total  = parseFloat(req.totalAmount || 0)
  const nonRef = ((total * bps) / 10000).toFixed(2)
  const ref    = (total - parseFloat(nonRef)).toFixed(2)
  const dl     = new Date(req.cancellationDeadline * 1000).toLocaleString()
  const ci     = new Date(req.checkInDate * 1000).toLocaleString()
  const isLoading = step === 'approving' || step === 'paying'

  return (
    <div className="fade-up" style={{ maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Booking Deposit</div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px' }}>
          {req.merchantName || shortAddress(req.merchant)}
        </h1>
      </div>

      {/* Booking summary */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Booking Deposit</div>
            {req.description && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{req.description}</div>}
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 4 }}>{req.bookingRef}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 800, color: 'var(--usdc)', letterSpacing: '-1px', lineHeight: 1 }}>{total.toFixed(2)}</div>
            <div style={{ fontSize: 14, color: 'var(--text2)' }}>USDC</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><span style={{ color: 'var(--text3)' }}>Check-in:</span> {ci}</div>
          <div><span style={{ color: 'var(--text3)' }}>Cancel by:</span> {dl}</div>
        </div>
      </div>

      <BookingPolicyCard totalAmount={req.totalAmount} nonRefundableBps={bps} />

      {/* Cancellation & payment terms */}
      <div className="card" style={{ marginBottom: 16, fontSize: 13 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Booking terms</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text3)' }}>Non-refundable deposit</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{nonRef} USDC ({Math.round(bps/100)}%)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text3)' }}>Refundable escrow</span>
            <span style={{ color: 'var(--green)', fontWeight: 600 }}>{ref} USDC</span>
          </div>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text3)' }}>Cancel by</span>
            <span style={{ color: 'var(--text)' }}>{dl}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text3)' }}>Check-in</span>
            <span style={{ color: 'var(--text)' }}>{ci}</span>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
          If cancelled before the deadline, the refundable portion is returned to your wallet. Non-refundable deposit is retained by the merchant.
        </div>
      </div>

      {/* Payment method selector */}
      {!payMethod && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Select payment method
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Credit / Debit Card — grayed out */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 10,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              opacity: 0.45, cursor: 'not-allowed',
            }}>
              <div style={{ fontSize: 22 }}>💳</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text2)' }}>Credit / Debit Card</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Not available in this demo</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>
                Coming soon
              </div>
            </div>

            {/* Pay with USDC — active */}
            <div
              onClick={() => setPayMethod('usdc')}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 10,
                background: '#0a1628', border: '2px solid var(--usdc)',
                cursor: 'pointer', transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <div style={{ fontSize: 22 }}>◆</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--usdc)' }}>Pay with USDC</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  On-chain · Arc Network · Instant receipt
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--usdc)' }}>
                {total.toFixed(2)} USDC
              </div>
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
                    {step === 'approving' ? 'Step 1/2 — Approving USDC...' : 'Step 2/2 — Paying deposit...'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Confirm in MetaMask</div>
                </div>
              </div>
            </div>
          )}

          {!account ? (
            <button onClick={handleConnect} disabled={connecting} className="btn-primary btn-full" style={{ marginBottom: 12 }}>
              {connecting ? <><span className="spinner" />Connecting...</> : '🔗 Connect Wallet to Pay'}
            </button>
          ) : (
            <div>
              <div style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px', marginBottom: 12,
                display: 'flex', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>Paying from</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{shortAddress(account)}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--usdc)', fontWeight: 600 }}>{balance} USDC</div>
              </div>
              <button onClick={handlePay} disabled={isLoading} className="btn-primary btn-full" style={{ marginBottom: 8 }}>
                {step === 'idle'      && `🏨 Pay ${total.toFixed(2)} USDC deposit`}
                {step === 'approving' && <><span className="spinner" />Approving USDC...</>}
                {step === 'paying'    && <><span className="spinner" />Paying deposit...</>}
              </button>
              <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginBottom: 12 }}>
                2 MetaMask confirmations · {nonRef} USDC released immediately · {ref} USDC held in escrow
              </p>
            </div>
          )}
        </div>
      )}

      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text2)' }}>TESTNET ONLY.</strong> Testnet tokens have no real value.
        Not a regulated escrow service. If the USDC transfer fails, no booking is created.
      </div>
    </div>
  )
}
