export function shortAddress(addr) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function formatDate(isoString) {
  if (!isoString) return '—'
  return new Date(isoString.replace(' UTC', 'Z')).toLocaleString()
}

export function generateRef() {
  const date = new Date()
  const y    = date.getFullYear()
  const m    = String(date.getMonth() + 1).padStart(2, '0')
  const n    = String(Math.floor(Math.random() * 9000) + 1000)
  return `PAY-${y}${m}-${n}`
}
