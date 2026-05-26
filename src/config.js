// ArcPay Configuration — Arc Testnet
export const APP_URL = import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
// Chain ID: 5042002 (hex: 0x4cef52)

export const ARC_TESTNET = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
}

export const CHAIN_ID_HEX        = '0x4cef52'
export const ARCPROOF_ADDRESS    = '0x1c5DAc22997FFD5CAf81f9A3d81F5258587788a3'
export const ARCBOOKING_ADDRESS  = '0xd47E321a220B5aE86eb45d4c744C5E087aAa8d0C'
export const USDC_ADDRESS        = '0x3600000000000000000000000000000000000000'
export const USDC_DECIMALS       = 6
export const USDC_SYMBOL         = 'USDC'
export const ARCSCAN_BASE        = 'https://testnet.arcscan.app'
export const APP_BASE_URL        = APP_URL

export function isBookingContractConfigured() {
  return ARCBOOKING_ADDRESS && !ARCBOOKING_ADDRESS.startsWith('DEPLOY')
}

export const PURPOSE_CODES = [
  { value: 'INVOICE',   label: 'Invoice'         },
  { value: 'SERVICE',   label: 'Service Payment' },
  { value: 'DONATION',  label: 'Donation'        },
  { value: 'RETAIL',    label: 'Retail Purchase' },
  { value: 'B2B',       label: 'B2B Payment'     },
  { value: 'OTHER',     label: 'Other'           },
]

export const ARCTRAVEL_ESCROW_ADDRESS = '0x894142646064CA2bBc8fE1e5E433E20a9DC2B024'

export function isTravelContractConfigured() {
  return ARCTRAVEL_ESCROW_ADDRESS && !ARCTRAVEL_ESCROW_ADDRESS.startsWith('DEPLOY')
}

// v2 — Registry v4, Delayed Payment, Tranche, Refund
export const ARCMERCHANT_REGISTRY_ADDRESS = '0xcfA93Ec583ff0cecB74eB02F9a18939D5609E303'
export const ARC_COMMITMENT_ADDRESS       = '0xeC0642BA27dc746490Cc0Fc532D605E7052bD19A'
export const ARC_REFUND_ADDRESS           = '0xeaCDdf3c38D566c349c65898d2f4805F79D00580'

export function isMerchantRegistryConfigured() {
  return ARCMERCHANT_REGISTRY_ADDRESS && !ARCMERCHANT_REGISTRY_ADDRESS.startsWith('DEPLOY')
}
export function isCommitmentContractConfigured() {
  return ARC_COMMITMENT_ADDRESS && !ARC_COMMITMENT_ADDRESS.startsWith('DEPLOY')
}
export function isRefundContractConfigured() {
  return ARC_REFUND_ADDRESS && !ARC_REFUND_ADDRESS.startsWith('DEPLOY')
}
