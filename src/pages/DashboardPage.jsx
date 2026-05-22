import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchReceivedProofIds, fetchProof,
  formatUsdc, formatTs, buildReceiptObject,
  recoverTxHash,
} from '../utils/receipts.js'
import { getCachedTxHash, getPaymentRequests } from '../utils/paymentRequest.js'
import { shortAddress, isValidAddress } from '../utils/wallet.js'
import { ARCSCAN_BASE, isMerchantRegistryConfigured } from '../config.js'
import { getMerchantIdByWallet, getMerchantWallets } from '../utils/merchant.js'
import { downloadCSV } from '../utils/csv.js'
import { downloadReceiptPDF } from '../utils/pdf.js'
import { fetchMerchantCommitmentIds, fetchCommitment, COMMITMENT_STATUS_LABEL, COMMITMENT_STATUS_COLOR, COMMITMENT_TYPE_LABEL } from '../utils/commitment.js'
import { isCommitmentContractConfigured, ARCSCAN_BASE as ARCSCAN } from '../config.js'

export default function DashboardPage({ account, onConnect, connecting }) {
  const [merchantInput, setMerchantInput] = useState('')
  const [merchantAddr,  setMerchantAddr]  = useState('')
  const [proofs,        setProofs]        = useState([])
  const [receipts,      setReceipts]      = useState([])
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [linkedWallets,  setLinkedWallets]  = useState([])
  const [commitments,    setCommitments]    = useState([])

  // Auto-load when wallet connects — carica tutti i wallet del merchant
  useEffect(() => {
    if (!account) return
    if (isMerchantRegistryConfigured()) {
      getMerchantIdByWallet(account).then(async id => {
        if (id && id.toString() !== '0') {
          // Merchant registrato — carica tutti i wallet collegati
          const wallets = await getMerchantWallets(id)
          if (wallets && wallets.length > 0) {
            // Usa il wallet principale (ownerWallet) come indirizzo display
            setMerchantAddr(account)
            setMerchantInput(account)
            // Salva lista wallets per caricare pagamenti aggregati
            setLinkedWallets(wallets.map(w => w.toLowerCase()))
            return
          }
        }
        setMerchantAddr(account)
        setMerchantInput(account)
      }).catch(() => {
        setMerchantAddr(account)
        setMerchantInput(account)
      })
    } else {
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
      // Aggrega pagamenti di tutti i wallet collegati
      const walletsToLoad = linkedWallets.length > 0 ? linkedWallets : [addr]
      const allIds = []
      for (const w of walletsToLoad) {
        const wIds = await fetchReceivedProofIds(w)
        allIds.push(...wIds)
      }
      // Deduplica
      const ids = [...new Set(allIds.map(id => id.toString()))].map(id => BigInt(id))
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

      // Load commitments (delayed + tranche)
      if (isCommitmentContractConfigured()) {
        try {
          const walletsForCommitments = linkedWallets.length > 0 ? linkedWallets : [addr]
          const allCommitmentIds = []
          for (const w of walletsForCommitments) {
            const ids = await fetchMerchantCommitmentIds(w)
            allCommitmentIds.push(...ids)
          }
          const uniqueIds = [...new Set(allCommitmentIds.map(id => id.toString()))]
          const commitmentList = []
          for (const id of [...uniqueIds].reverse()) {
            const cm = await fetchCommitment(id)
            if (cm) commitmentList.push(cm)
          }
          setCommitments(commitmentList)
        } catch {}
      }
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
  const totalUsdc      = receipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)
  const avgUsdc        = receipts.length > 0 ? (totalUsdc / receipts.length).toFixed(2) : '0.00'
  const pendingCommitments = commitments.filter(c => c.status === 0).length
  const totalCommitmentsUsdc = commitments.filter(c => c.status === 0).reduce((s, c) => s + parseFloat(c.totalAmount || 0), 0)

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
            { label: 'Pending commitments', value: pendingCommitments.toString(),  color: pendingCommitments > 0 ? 'var(--yellow)' : 'var(--text2)' },
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

      {/* Commitments section */}
      {commitments.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            📅 Delayed & Tranche Commitments ({commitments.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {commitments.map(cm => (
              <div key={cm.commitmentId} className="card" style={{ padding: '12px 16px', borderColor: cm.status === 0 ? 'var(--border)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 600, background: (COMMITMENT_STATUS_COLOR[cm.status] || 'var(--text3)') + '22', color: COMMITMENT_STATUS_COLOR[cm.status] || 'var(--text3)', border: `1px solid ${(COMMITMENT_STATUS_COLOR[cm.status] || 'var(--text3)')}44` }}>
                      {COMMITMENT_STATUS_LABEL[cm.status]} · {COMMITMENT_TYPE_LABEL[cm.type]}
                    </span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{cm.ref}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{shortAddress(cm.customer)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--usdc)' }}>{cm.totalAmount} USDC</span>
                    <Link to={`/commitment/${cm.commitmentId}?mode=merchant`} style={{ textDecoration: 'none' }}>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View →</button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
