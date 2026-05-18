import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchReceivedProofIds, fetchProof,
  formatUsdc, formatTs, buildReceiptObject,
  recoverTxHash,
} from '../utils/receipts.js'
import { getCachedTxHash, getPaymentRequests } from '../utils/paymentRequest.js'
import { shortAddress, isValidAddress } from '../utils/wallet.js'
import { ARCSCAN_BASE } from '../config.js'
import { downloadCSV } from '../utils/csv.js'
import { downloadReceiptPDF } from '../utils/pdf.js'

export default function DashboardPage({ account, onConnect, connecting }) {
  const [merchantInput, setMerchantInput] = useState('')
  const [merchantAddr,  setMerchantAddr]  = useState('')
  const [proofs,        setProofs]        = useState([])
  const [receipts,      setReceipts]      = useState([])
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')

  // Auto-load when wallet connects
  useEffect(() => {
    if (account && !merchantAddr) {
      setMerchantAddr(account)
      setMerchantInput(account)
    }
  }, [account])

  useEffect(() => {
    if (merchantAddr) load(merchantAddr)
  }, [merchantAddr])

  async function load(addr) {
    if (!isValidAddress(addr)) { setError('Invalid wallet address'); return }
    setLoading(true)
    setError('')
    try {
      const ids      = await fetchReceivedProofIds(addr)
      const reversed = [...ids].reverse()
      const fetched  = []
      for (const id of reversed) {
        try {
          const p = await fetchProof(id.toString())
          if (p) fetched.push({ id: id.toString(), proof: p })
        } catch {}
      }
      setProofs(fetched)

      // Load local payment requests for metadata enrichment
      const localRequests = getPaymentRequests()

      const built = []
      const totalMerchantReceipts = fetched.length
      for (const { id, proof } of fetched) {
        let txHash = getCachedTxHash(id)
        if (!txHash && proof.createdBlock && proof.createdBlock > 0n) {
          txHash = await recoverTxHash(id, proof.createdBlock)
        }

        // Try to enrich with frontend-only metadata from localStorage
        // Match by paymentRef — not recoverable from chain, only available locally
        const localReq = localRequests.find(r => r.ref === proof.paymentRef)
        built.push(buildReceiptObject({
          proofData:    proof,
          txHash,
          proofId:      id,
          merchantName: localReq?.name  || null,
          description:  localReq?.desc  || null,
        }))
      }
      setReceipts(built)
    } catch (e) {
      setError('Failed to load payments. Are you on Arc Testnet?')
    } finally {
      setLoading(false)
    }
  }

  function handleSearch() {
    const addr = merchantInput.trim()
    if (!isValidAddress(addr)) { setError('Invalid wallet address'); return }
    setMerchantAddr(addr)
  }

  // Stats
  const totalUsdc = receipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)
  const avgUsdc   = receipts.length > 0 ? (totalUsdc / receipts.length).toFixed(2) : '0.00'

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          Merchant Dashboard
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>
          View all received payments for a wallet address.
        </p>
      </div>

      {/* Wallet selector */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Merchant wallet address</label>
            <input
              value={merchantInput}
              onChange={e => setMerchantInput(e.target.value)}
              placeholder="0x... (your wallet or any merchant)"
            />
          </div>
          <button onClick={handleSearch} disabled={loading} className="btn-primary" style={{ padding: '10px 20px', height: 42 }}>
            {loading ? <><span className="spinner" />Loading...</> : '🔍 Load'}
          </button>
          {!account && (
            <button onClick={onConnect} disabled={connecting} className="btn-ghost" style={{ padding: '10px 16px', height: 42 }}>
              {connecting ? <><span className="spinner" /></> : 'Connect wallet'}
            </button>
          )}
        </div>
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {/* Stats */}
      {receipts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total received',  value: `${totalUsdc.toFixed(2)} USDC`, color: 'var(--usdc)' },
            { label: 'Payments',        value: receipts.length.toString(),      color: 'var(--text)' },
            { label: 'Average',         value: `${avgUsdc} USDC`,               color: 'var(--text2)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'var(--display)', letterSpacing: '-0.5px' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {receipts.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'flex-end' }}>
          <button onClick={() => downloadCSV(receipts, merchantAddr)} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>
            📊 Export CSV
          </button>
          <button onClick={() => load(merchantAddr)} disabled={loading} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>
            ↻ Refresh
          </button>
        </div>
      )}

      {/* Table */}
      {receipts.length === 0 && !loading && merchantAddr && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📭</div>
          <p>No payments received for this address yet.</p>
          <Link to="/create">
            <button className="btn-primary" style={{ marginTop: 16, padding: '10px 24px' }}>
              Create payment request →
            </button>
          </Link>
        </div>
      )}

      {receipts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {receipts.map((r, i) => {
            const proof = proofs[i]?.proof
            return (
              <div key={r.receipt_id} className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{r.purpose_code}</span>
                    </div>
                    <div style={{ fontSize: 13, fontFamily: 'var(--mono)', marginBottom: 4 }}>{r.payment_ref}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                      From: {shortAddress(r.customer_wallet)} · {r.timestamp_utc?.slice(0, 10)}
                    </div>
                    {r.description && r.description !== 'Not available — frontend-only metadata not stored on-chain' && (
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{r.description}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, color: 'var(--usdc)', letterSpacing: '-0.5px' }}>
                      {r.amount}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{r.token_symbol}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={`/receipt/${r.receipt_id}?mode=merchant`} style={{ textDecoration: 'none' }}>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}>View receipt</button>
                  </Link>
                  {r.transaction_hash && (
                    <a href={`${ARCSCAN_BASE}/tx/${r.transaction_hash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}>ArcScan ↗</button>
                    </a>
                  )}
                  <button onClick={() => downloadReceiptPDF(r)} className="btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}>PDF</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
