import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { fetchCustomerTravelIds, fetchTravelBooking, fetchTravelTxHashes } from '../utils/travel.js'
import { formatUsdc, formatTs } from '../utils/booking.js'
import { shortAddress } from '../utils/wallet.js'
import { isTravelContractConfigured, isMerchantRegistryConfigured } from '../config.js'
import { getMerchantByWallet } from '../utils/merchant.js'

const STATUS_LABELS = {
  0: { label: 'Active',                  badge: 'badge-green' },
  1: { label: 'Tranche Paid',            badge: 'badge-blue'  },
  2: { label: 'Cancelled',               badge: 'badge-red'   },
  3: { label: 'Cancelled — Missed Pmt',  badge: 'badge-red'   },
  4: { label: 'Released to Agency',      badge: 'badge-gray'  },
}

export default function MyTravelPage() {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const configured = isTravelContractConfigured()
  const [bookings, setBookings] = useState([])
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!isConnected || !address || !configured) return
    setLoading(true)
    fetchCustomerTravelIds(address).then(async ids => {
      const all = await Promise.all(ids.map(id => fetchTravelBooking(id).catch(() => null)))
      const valid = all.filter(Boolean).sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      const withNames = await Promise.all(valid.map(async b => {
        let merchantName = shortAddress(b.merchant)
        if (isMerchantRegistryConfigured()) {
          try {
            const m = await getMerchantByWallet(b.merchant)
            if (m && m.tradingName) merchantName = m.tradingName
          } catch {}
        }
        let createTxHash = null, cancelTxHash = null, releaseTxHash = null, trancheRequestTxHash = null, tranchePaidTxHash = null
        try {
          const h = await fetchTravelTxHashes(b)
          createTxHash         = h.createHash
          cancelTxHash         = h.cancelHash
          releaseTxHash        = h.releaseHash
          trancheRequestTxHash = h.trancheReqHash
          tranchePaidTxHash    = h.tranchePaidHash
        } catch {}
        return { ...b, merchantName, createTxHash, cancelTxHash, releaseTxHash, trancheRequestTxHash, tranchePaidTxHash }
      }))
      setBookings(withNames)
    }).finally(() => setLoading(false))
  }, [address, isConnected])

  if (!isConnected) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>✈️</div>
      <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to see your travel bookings</p>
      <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 28px' }}>Connect Wallet</button>
    </div>
  )

  function exportCSV() {
    if (!bookings.length) return
    const ARCSCAN  = 'https://testnet.arcscan.app'
    const ARCBOOK  = '0x894142646064CA2bBc8fE1e5E433E20a9DC2B024'
    const APP_URL  = 'https://arc-pay-testnet.vercel.app'
    const ts = unix => unix ? new Date(Number(unix)*1000).toISOString().replace('T',' ').slice(0,19)+' UTC' : ''
    const headers = [
      'timestamp','status','customerWallet','merchantWallet','travelRef','description',
      'totalPackageAmount','initialPaymentAmount','nonRefundableAmount','refundableEscrowAmount','nonRefundablePct',
      'trancheAmount','tranchePaid','travelStartDate','paymentDueDate','paymentDeadline','cancellationDeadline',
      'createdAt','closedAt','metadataHash',
      'createTxHash','createArcScan','createTimestamp',
      'trancheRequestTxHash','trancheRequestArcScan','trancheRequestTimestamp',
      'tranchePaidTxHash','tranchePaidArcScan','tranchePaidTimestamp',
      'cancelTxHash','cancelArcScan','cancelTimestamp',
      'releaseTxHash','releaseArcScan','releaseTimestamp',
      'travelUrl','network','contractAddress','testnetDisclaimer',
    ]
    const rows = bookings.map(b => {
      const status = Number(b.status)
      const cTx  = b.createTxHash         || ''
      const rqTx = b.trancheRequestTxHash || ''
      const tpTx = b.tranchePaidTxHash    || ''
      const xTx  = b.cancelTxHash         || ''
      const rlTx = b.releaseTxHash        || ''
      return [
        ts(b.createdAt),
        ['Active','TranchePaid','Cancelled','Cancelled — Missed Payment','Released to Merchant'][status] ?? '',
        b.customer ?? '',
        b.merchant ?? '',
        b.travelRef ?? '',
        b.description ?? '',
        b.totalPackageAmount     ? (Number(b.totalPackageAmount)/1e6).toFixed(2) + ' USDC'     : '',
        b.initialPaymentAmount   ? (Number(b.initialPaymentAmount)/1e6).toFixed(2) + ' USDC'   : '',
        b.nonRefundableAmount    ? (Number(b.nonRefundableAmount)/1e6).toFixed(2) + ' USDC'    : '',
        b.refundableEscrowAmount ? (Number(b.refundableEscrowAmount)/1e6).toFixed(2) + ' USDC' : '',
        b.nonRefundableBps       ? (Number(b.nonRefundableBps)/100).toFixed(2) + '%'           : '',
        b.trancheAmount          ? (Number(b.trancheAmount)/1e6).toFixed(2) + ' USDC'          : '',
        b.tranchePaid ? 'Yes' : 'No',
        ts(b.travelStartDate),
        ts(b.paymentDueDate),
        ts(b.paymentDeadline),
        ts(b.cancellationDeadline),
        ts(b.createdAt),
        ts(b.closedAt),
        b.metadataHash ?? '',
        cTx,  cTx  ? `${ARCSCAN}/tx/${cTx}`  : '', ts(b.createdAt),
        rqTx, rqTx ? `${ARCSCAN}/tx/${rqTx}` : '', b.trancheRequested ? ts(b.createdAt) : '',
        tpTx, tpTx ? `${ARCSCAN}/tx/${tpTx}` : '', ts(b.tranchePaidAt),
        xTx,  xTx  ? `${ARCSCAN}/tx/${xTx}`  : '', (status === 2 || status === 3) ? ts(b.closedAt) : '',
        rlTx, rlTx ? `${ARCSCAN}/tx/${rlTx}` : '', status === 4 ? ts(b.closedAt) : '',
        `${APP_URL}/travel/${b.travelId}`,
        'Arc Testnet (Chain ID 5042002)',
        ARCBOOK,
        'TESTNET ONLY. Testnet tokens have no real economic value. Not a regulated payment service.',
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `arcpay_mytravel_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Customer</span>
          <span className="badge badge-gray">Travel</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px', marginBottom: 4 }}>My Travel</h1>
          {bookings.length > 0 && <button onClick={exportCSV} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>⬇ Export CSV</button>}
        </div>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>Travel bookings for {shortAddress(address)}</p>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /> Loading travel bookings...</div>
      ) : bookings.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No travel bookings found for this wallet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bookings.map(b => {
            const st  = STATUS_LABELS[Number(b.status)] || STATUS_LABELS[0]
            const now = Math.floor(Date.now() / 1000)
            const isActive     = Number(b.status) === 0
            const canCancel    = (isActive || Number(b.status) === 1) && now < Number(b.cancellationDeadline)
            const trancheDue   = isActive && now >= Number(b.paymentDueDate) && now <= Number(b.paymentDeadline) && !b.tranchePaid
            const trancheOverdue = isActive && now > Number(b.paymentDeadline) && !b.tranchePaid

            return (
              <div key={b.travelId.toString()} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{b.travelRef}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Agency: {b.merchantName || shortAddress(b.merchant)} · {formatTs(Number(b.createdAt))}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--usdc)' }}>
                      {formatUsdc(b.totalPackageAmount)} USDC
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      Escrow: {formatUsdc(b.refundableEscrowAmount)} USDC
                    </div>
                  </div>
                </div>

                {/* Alert tranche */}
                {trancheDue && (
                  <div style={{ background: '#0a1628', border: '1px solid var(--usdc)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: 'var(--usdc)' }}>
                    ⚡ Tranche payment due — {formatUsdc(b.trancheAmount)} USDC · Deadline: {new Date(Number(b.paymentDeadline)*1000).toLocaleString()}
                  </div>
                )}
                {trancheOverdue && (
                  <div style={{ background: '#1a0808', border: '1px solid #f04f4f', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#f08080' }}>
                    ⚠ Tranche payment overdue — agency may cancel
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={`/travel/${b.travelId}`} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>
                    View details →
                  </Link>
                  {trancheDue && (
                    <Link to={`/travel/${b.travelId}`} className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
                      Pay tranche now
                    </Link>
                  )}
                  {canCancel && (
                    <Link to={`/travel/${b.travelId}`} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px', color: '#f08080', borderColor: '#f08080' }}>
                      Cancel
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
