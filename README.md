# ArcPay

**Your keys. Your payments. Your policy. On-chain.**

ArcPay is a merchant USDC payment prototype on Arc Testnet. Merchants register a self-declared public profile and default payment/refund policy on-chain, accept USDC across four payment flows, and generate verifiable receipts — all without a backend or server.

Not a production payment service. Not a regulated escrow. Not a lending or financing product. Testnet USDC has no real economic value.

---

## What ArcPay does

- **Online payment links and QR codes** — instant USDC payments with on-chain ArcProof receipts
- **Luxury retail in-store checkout** — physical QR checkout for boutiques and high-value retail
- **Hotel booking deposits** — programmable escrow with refundable/non-refundable split and cancellation deadline
- **Travel agency scheduled payments** — high-value packages with initial payment today and one future tranche; customer chooses full payment or scheduled tranche at checkout
- **On-chain merchant policy** — merchants publish default payment/refund policies on-chain; customers see verifiable terms before paying
- **Merchant profile registry** — self-declared public merchant identity with linked wallets
- **Merchant analytics** — live on-chain dashboard across all four payment channels

---

## Smart contracts

### ArcProof — instant payment receipt engine

```
Status:  Deployed
Address: 0x9A284a4af4476Dddb353793A79C1a8BfC09e8334
Source:  contracts/ArcProof.sol
```

Atomically executes a USDC payment and creates a structured on-chain Payment Receipt in the same transaction. Powers: Online Payments, Luxury Retail Checkout, Travel "Pay full amount now".

### ArcBookingEscrow — hotel booking deposit engine

```
Status:  Deployed
Address: 0xe83f411EaCe17C202598935cdD4E3646cD86899F
Source:  contracts/ArcBookingEscrow.sol
```

Manages hotel booking deposits with refundable/non-refundable split and cancellation deadline enforced on-chain.

Statuses: `Active` → `CancelledBeforeDeadline` or `ReleasedToMerchant`

No tranche logic. No accept/reject. Not modified from original.

### ArcTravelEscrow — travel scheduled payment engine

```
Status:  Deploy yourself via Remix
Config:  ARCTRAVEL_ESCROW_ADDRESS in src/config.js
Source:  contracts/ArcTravelEscrow.sol
```

Manages high-value travel bookings with an initial payment split (non-refundable to agency + refundable escrow) and one future scheduled tranche paid directly to the agency.

Statuses: `Active` → `TranchePaid` → `ReleasedToMerchant` or `CancelledBeforeDeadline` or `CancelledForMissedPayment`

Functions: `createTravelBooking()` · `requestTranchePayment()` · `payTranche()` · `cancelBeforeDeadline()` · `cancelForMissedPayment()` · `releaseAfterCancellationDeadline()`

**Not lending. Not BNPL. Not consumer credit.** ArcPay does not advance funds. The tranche must be paid by the customer when due.

### ArcMerchantRegistry — merchant profile and policy registry

```
Status:  Deploy yourself via Remix
Config:  ARCMERCHANT_REGISTRY_ADDRESS in src/config.js
Source:  contracts/ArcMerchantRegistry.sol
```

Self-declared public merchant identity, linked wallets, and default payment/refund policy. No admin. No fees. No KYC. No verification.

The registry stores two structs:

**Merchant** — public business identity:
`merchantId` · `ownerWallet` · `tradingName` · `legalName` · `businessCategory` · `website` · `country` · `businessAddress` · `businessEmail` · `lei` · `vatOrCompanyId` · `otherPublicIdentifier` · `profileHash` · `profileVersion` · `active` · `createdAt` · `updatedAt`

**MerchantPolicy** — default payment and refund settings:

| Field | Default | Meaning |
|-------|---------|---------|
| `allowScheduledTranche` | `false` | Merchant accepts scheduled tranche payments |
| `defaultNonRefundableBps` | `3000` | 30% non-refundable on initial payment |
| `defaultInitialPaymentBps` | `1000` | 10% of total as initial payment (Travel) |
| `defaultTrancheBps` | `3000` | 30% of total as tranche (Travel) |
| `paymentDueOffsetDays` | `90` | Tranche due N days before travel/check-in |
| `paymentDeadlineOffsetDays` | `75` | Tranche must be paid N days before travel |
| `cancellationCutoffDays` | `30` | Refund terms change N days before travel |
| `refundBpsBeforeCutoff` | `7000` | 70% refund if cancelled before cutoff |
| `refundBpsAfterCutoff` | `0` | 0% refund if cancelled after cutoff |
| `policyVersion` | `1` | Increments on each policy update |

Policy defaults **pre-fill** new Hotel and Travel request forms only. They do NOT automatically modify existing bookings or change contract behavior. Final terms for each booking live in ArcBookingEscrow or ArcTravelEscrow.

Functions:
- `registerMerchant()` — registers profile + creates default policy automatically
- `updateMerchantProfile()` — updates identity fields, increments profileVersion
- `updateMerchantPolicy()` — updates all 9 policy fields, increments policyVersion
- `addWallet()` / `removeWallet()` — manage linked wallets (owner only)
- `getMerchantPolicy()` / `getMerchantPolicyByWallet()` — read policy on-chain

---

## The four payment flows

### 1. Online Payments — `/create`

Merchant creates a payment link or QR. Customer opens in any browser, connects wallet, pays USDC. ArcProof creates a Payment Receipt atomically.

### 2. Luxury Retail Checkout — `/luxury`

Merchant generates QR or link for physical checkout. Customer scans with mobile wallet and pays. ArcProof receipt immediately.

### 3. Hotel Booking Deposit — `/booking`

Merchant creates a booking deposit link. Guest pays 100%. Non-refundable portion goes immediately to hotel. Refundable portion stays in escrow until cancellation deadline.

### 4. Travel Agency Scheduled Payments — `/travel`

Merchant creates a travel booking with initial payment + scheduled tranche. Customer checkout shows two merchant-approved options:

**Option A — Pay full amount now**
→ ArcProof · instant receipt · no escrow

**Option B — Pay initial + scheduled tranche**
→ ArcTravelEscrow · initial split into non-refundable (to agency) + refundable (escrow) · future tranche on scheduled date

The customer only sees the tranche option if the merchant enabled `allowScheduledTranche` for that specific booking request.

---

## Merchant profile and policy

### How to access

Click your wallet address (top-right when connected) → **Merchant Profile**, or go to `/merchant-profile`.

### What to publish

Profile and policy are permanently stored on-chain. Do NOT publish: customer data, private notes, personal data, bank details, internal metrics, revenue, or transaction counts.

### Pre-fill

After connecting a wallet linked to a merchant profile, ArcPay pre-fills:
- **Travel Agency** → agency name, `allowScheduledTranche`, all 9 policy fields
- **Hotel Booking** → hotel name, non-refundable %
- **Luxury Retail / Online** → merchant name

---

## Receipt types

| Receipt | Powered by | Available formats |
|---------|-----------|------------------|
| Payment Receipt | ArcProof | PDF, JSON |
| Hotel Booking Receipt | ArcBookingEscrow events | PDF, JSON |
| Travel Booking Receipt | ArcTravelEscrow events | PDF, JSON |
| Tranche Payment Receipt | ArcTravelEscrow events | PDF, JSON |

ArcProof powers instant payment receipts. ArcBookingEscrow and ArcTravelEscrow generate lifecycle receipts through on-chain events and stored state.

---

## Merchant analytics — `/analytics`

Live analytics loaded from Arc Testnet on demand. No backend, no database.

Tabs: Overview · Luxury Retail · Online Payments · Hotel Booking · Ask ArcPay AI · Coming Soon

Ask ArcPay AI — local dynamic assistant, no GPT/Claude, no external API.

---

## WalletConnect

WalletConnect v2 (Web3Modal) + wagmi:
- **Desktop** — MetaMask browser extension
- **Mobile** — WalletConnect QR; scan with MetaMask Mobile, Rainbow, Trust Wallet, or any compatible wallet
- **In-app** — open payment links in MetaMask Mobile's built-in browser

Wallet menu (click address top-right when connected): Merchant Profile · Copy address · Switch wallet · Disconnect.

---

## Arc Testnet

```
Network name:  Arc Testnet
RPC URL:       https://rpc.testnet.arc.network
Chain ID:      5042002
Symbol:        USDC
Explorer:      https://testnet.arcscan.app
USDC ERC-20:   0x3600000000000000000000000000000000000000
```

USDC for transfers: 6 decimals. Arc native balance internally: 18 decimals.
Testnet USDC faucet: `https://faucet.circle.com`

---

## Tech stack

React + Vite · viem · wagmi · @web3modal/wagmi · @tanstack/react-query · Recharts · jsPDF · qrcode.react · Vercel

No backend. No database. No paid APIs. No external AI API.

---

## Project structure

```
contracts/
  ArcProof.sol               — instant payment receipt engine (deployed)
  ArcBookingEscrow.sol       — hotel booking deposit engine (deployed)
  ArcTravelEscrow.sol        — travel scheduled payment engine (deploy yourself)
  ArcMerchantRegistry.sol    — merchant profile + policy registry (deploy yourself)

src/
  config.js                  — chain config, all contract addresses
  walletConfig.js            — wagmi + WalletConnect v2

  abis/
    ArcProof.json · ArcBookingEscrow.json
    ArcTravelEscrow.json · ArcMerchantRegistry.json · ERC20.json

  pages/
    HomePage.jsx
    CreatePaymentPage.jsx / CheckoutPage.jsx / ReceiptPage.jsx / DashboardPage.jsx
    LuxuryRetailPage.jsx
    BookingPage.jsx / BookingCheckoutPage.jsx / BookingDetailsPage.jsx / BookingDashboardPage.jsx
    TravelAgencyPage.jsx / TravelCheckoutPage.jsx / TravelDetailsPage.jsx / TravelDashboardPage.jsx
    AnalyticsPage.jsx
    MerchantProfilePage.jsx
    QRPage.jsx

  utils/
    wallet.js · receipts.js · booking.js · travel.js · merchant.js
    analytics.js · pdf.js · bookingPdf.js · travelPdf.js
    csv.js · bookingCsv.js · paymentRequest.js · bookingRequest.js
```

---

## Routes

| Route | Description |
|-------|-------------|
| `/` | Homepage |
| `/create` | Create online payment link |
| `/pay?r=...` | Customer checkout (online/luxury) |
| `/receipt/:id` | ArcProof payment receipt |
| `/dashboard` | Online/luxury payments dashboard |
| `/luxury` | Luxury retail checkout creation |
| `/booking` | Hotel booking deposit creation |
| `/booking/pay?r=...` | Guest hotel booking checkout |
| `/booking/:id` | Hotel booking status and actions |
| `/booking-dashboard` | Hotel booking dashboard |
| `/travel` | Travel booking creation |
| `/travel/pay?r=...` | Customer travel checkout (full or tranche) |
| `/travel/:id` | Travel booking status, actions, receipts |
| `/travel-dashboard` | Travel agency dashboard |
| `/analytics` | Merchant analytics |
| `/merchant-profile` | Merchant profile and policy registry |
| `/qr` | Fullscreen QR display |

---

## Setup

```bash
npm install
npm run build
npm run dev
```

Vercel: Framework Vite · Build `npm run build` · Output `dist`

Environment variable:
```
VITE_WALLETCONNECT_PROJECT_ID = your_project_id
```
Register free at `https://cloud.walletconnect.com`.

Deploy `ArcTravelEscrow.sol` and `ArcMerchantRegistry.sol` via Remix on Arc Testnet. Update addresses in `src/config.js`. ArcProof and ArcBookingEscrow are already deployed.

---

## Roadmap

Multi-tranche travel payments · Freelance Service Escrow · Marketplace Delivery Escrow · EURC/multi-stablecoin · x402/API payments · ERC-8183 work payments · GPT/Claude merchant copilot via secure backend · PMS/POS/ERP integrations · Privacy-preserving merchant reputation badges · Backend tranche payment notifications

---

## Disclaimers

ArcPay is an Arc Testnet proof of concept. Testnet USDC has no real value. ArcTravelEscrow is not lending/BNPL/credit — ArcPay does not advance funds. ArcMerchantRegistry records self-declared public information only — it does not verify identity or legal status. Merchant policy defaults pre-fill forms only — they do not modify existing bookings. No KYC/AML. Payment Receipts are not legally valid tax invoices. Smart contracts do not auto-execute at deadlines. Not affiliated with Circle or Arc Network.
