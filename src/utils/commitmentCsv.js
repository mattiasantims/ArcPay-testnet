import { COMMITMENT_STATUS_LABEL, COMMITMENT_TYPE_LABEL } from './commitment.js'
import { ARCSCAN_BASE, ARC_COMMITMENT_ADDRESS, APP_URL } from '../config.js'

function formatTs(unix) {
  if (!unix || unix === 0) return ''
  return new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

export function downloadCommitmentCSV(commitments, walletAddress) {
  if (!commitments || commitments.length === 0) return

  const headers = [
    'timestamp', 'type', 'status', 'customerWallet', 'merchantWallet',
    'merchantName', 'merchantLegalName', 'merchantCountry',
    'ref', 'description', 'totalAmount',
    'dueDate', 'deadline',
    'trancheCount', 'tranchesPaid',
    'txHash', 'arcscanUrl', 'commitmentUrl',
    'network', 'contractAddress', 'testnetDisclaimer',
  ]

  const rows = commitments.map(c => {
    const txHash = c.txHash || ''
    return [
      formatTs(c.createdAt),
      COMMITMENT_TYPE_LABEL[c.type]   ?? '',
      COMMITMENT_STATUS_LABEL[c.status] ?? '',
      c.customer  ?? '',
      c.merchant  ?? '',
      c.merchantName       ?? '',
      c.merchantLegalName  ?? '',
      c.merchantCountry    ?? '',
      c.ref       ?? '',
      c.description ?? '',
      c.totalAmount ?? '',
      formatTs(c.dueDate),
      formatTs(c.deadline),
      c.trancheAmounts?.length ?? 0,
      c.tranchesPaidCount ?? 0,
      txHash,
      txHash ? `${ARCSCAN_BASE}/tx/${txHash}` : '',
      `${APP_URL}/commitment/${c.commitmentId}`,
      'Arc Testnet (Chain ID 5042002)',
      ARC_COMMITMENT_ADDRESS ?? '',
      'TESTNET ONLY. Testnet tokens have no real economic value. Not a regulated payment service.',
    ]
  })

  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `arcpay_commitments_${walletAddress?.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
