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
export const ARCBOOKING_ADDRESS  = '0xe83f411EaCe17C202598935cdD4E3646cD86899F'
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

export const ARCMERCHANT_REGISTRY_ADDRESS = '0xaDDde5C9866C1BF870B393379fFdCF1Ef7f9Fb49'

export function isMerchantRegistryConfigured() {
  return ARCMERCHANT_REGISTRY_ADDRESS && !ARCMERCHANT_REGISTRY_ADDRESS.startsWith('DEPLOY')
}

export const ARCTRAVEL_ESCROW_ADDRESS = '0x924dE5cD60c730c03764Ec2cB7D9500B030Cb3Df'

export function isTravelContractConfigured() {
  return ARCTRAVEL_ESCROW_ADDRESS && !ARCTRAVEL_ESCROW_ADDRESS.startsWith('DEPLOY')
}
