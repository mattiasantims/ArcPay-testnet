# ArcPay

**Move USDC on Arc. Accept payments. Send payouts. Keep verifiable records.**

ArcPay is a web-based testnet MVP exploring how stablecoins can support practical merchant payment flows on Arc.

It is not a production payment service. It is not a bank, custodial wallet, regulated payment institution, payroll processor, lending product, BNPL product, KYC provider or compliance verification tool. Testnet tokens have no real economic value.

ArcPay is built around a simple product thesis: merchants should be able to use stablecoin payments without becoming crypto experts, while still keeping business-readable records that can be reconciled with their internal systems.

---

## What ArcPay demonstrates

ArcPay combines a browser-based frontend with smart contracts deployed on Arc Testnet.

Current demo modules include:

- **Online checkout** — hosted USDC payment links and QR flows.
- **Luxury and high-value retail** — in-person QR payment flows for premium or dealer-style environments.
- **Hotel booking deposits** — refundable/non-refundable deposit split with escrow release or cancellation.
- **Travel payment flows** — full payment or scheduled-tranche travel payment demo.
- **Merchant payouts** — single and batch USDC payouts to suppliers, contractors or team wallets.
- **Merchant profile and policy** — self-declared public merchant profile and default payment terms.
- **Refund and claim workflows** — merchant-managed refund request, approval, denial and direct refund flows.
- **PDF and CSV records** — downloadable records for merchants and counterparties.
- **ArcScan verification** — transaction hashes and explorer links for supported flows.
- **Merchant analytics** — local dashboard views across payment channels.

The current version is intentionally lightweight: no backend, no database, no hosted API and no custody of funds.

---

## Core principles

### Stablecoin-first

ArcPay uses USDC on Arc Testnet as the core payment asset. The goal is to explore stablecoin payment flows without exposing merchants to the volatility of non-stable crypto-assets.

### Non-custodial

ArcPay does not hold merchant, customer or counterparty funds. Users connect their own wallets, approve transactions and interact directly with smart contracts.

> Your keys. Your assets. Your payments.

### Record-oriented

Each payment or payout can be linked to a business reference such as an order ID, booking reference, invoice number, travel reference or payout reference.

The blockchain provides transaction evidence. The merchant keeps detailed business records off-chain and links them through references, metadata hashes, PDFs, CSV exports and ArcScan links.

### Merchant-focused

ArcPay is designed around practical merchant workflows, not only raw token transfers.

Merchants can accept USDC, send USDC, publish default payment terms, view activity and export records.

---

## Current product flows

### 1. Online payments

Merchants create a hosted payment link or QR code. A counterparty connects a wallet, pays USDC and receives a verifiable on-chain receipt.

Online payments can support refund requests, merchant approval/denial and direct merchant refunds in the demo.

### 2. Luxury and high-value retail

Merchants can create QR-based payment flows for physical or premium environments where a customer scans and pays from a wallet.

The demo also explores delayed payment, tranche payment and refund scenarios for high-value retail use cases.

### 3. Hotel booking deposits

The hotel booking flow demonstrates an escrow-backed deposit model:

- the non-refundable portion goes to the merchant;
- the refundable portion is held in escrow;
- cancellation before the cutoff returns the refundable portion;
- release after the cutoff sends the escrowed amount to the merchant.

### 4. Travel payment flows

The travel module demonstrates full payment and scheduled-tranche payment scenarios for travel packages.

Scheduled travel payments are not lending, credit or BNPL. ArcPay does not advance funds. The merchant receives funds only when the customer actually pays.

### 5. Merchant payouts

Merchant Payouts allow merchants to send USDC outbound to suppliers, contractors, team wallets or other counterparties.

The module supports:

- alias-based counterparty registry;
- single payouts;
- batch payouts;
- payment reference;
- description;
- metadata hash;
- PDF receipt;
- CSV export;
- ArcScan link.

Counterparty aliases should not include personal, payroll, tax or confidential information. Detailed counterparty records should remain off-chain with the merchant.

---

## Smart contracts

ArcPay currently uses the following Arc Testnet contracts.

| Module | Purpose | Address |
|---|---|---|
| `ArcProof` | Instant payments and on-chain receipts | `0x1c5DAc22997FFD5CAf81f9A3d81F5258587788a3` |
| `ArcBookingEscrow` | Hotel booking deposit escrow | `0xd47E321a220B5aE86eb45d4c744C5E087aAa8d0C` |
| `ArcTravelEscrow` | Travel scheduled payment flow | `0x894142646064CA2bBc8fE1e5E433E20a9DC2B024` |
| `ArcMerchantRegistry` | Merchant profile and default policy | `0xcfA93Ec583ff0cecB74eB02F9a18939D5609E303` |
| `ArcPaymentCommitment` | Delayed and tranche commitments | `0xC19d95C36C83F88082127204Fe32D5Cd8F838039` |
| `ArcRefund` | Merchant-managed refund requests and direct refunds | `0x0ad3F01645c419fc42dAef4ecF5A7213A8a030dC` |
| `ArcMerchantPayouts` | Outbound merchant payouts and alias counterparties | `0x70D9407b5C6fbE2b74C4E65221edCDBF4A74fA93` |

USDC ERC-20 on Arc Testnet:

```text
0x3600000000000000000000000000000000000000
```

---

## Network

ArcPay currently runs on Arc Testnet.

```text
Network:  Arc Testnet
RPC:      https://rpc.testnet.arc.network
Chain ID: 5042002
Symbol:   USDC
Explorer: https://testnet.arcscan.app
```

---

## How to run locally

```bash
npm install --legacy-peer-deps
npm run dev
npm run build
```

Environment variable:

```text
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
```

---

## Current limitations

ArcPay is a testnet MVP and remains under active iteration.

Current limitations include:

- no backend;
- no database;
- no hosted checkout API;
- no API keys;
- no signed webhooks;
- no indexer;
- no production-grade access control;
- no formal security audit;
- no legal, compliance or regulatory review;
- no fiat settlement;
- no production custody or safeguarding services;
- no guarantee that the demo will be deployed to mainnet.

The current frontend reads data directly from on-chain contracts and events. This is acceptable for a demo, but a production version would require backend/indexing infrastructure for performance, reliability and reconciliation.

---

## Potential production path

ArcPay may be evaluated for future development beyond testnet. Any production path would require additional work, including:

- security review and contract hardening;
- backend/indexer;
- merchant API and checkout sessions;
- signed webhooks;
- pagination and performance optimization;
- e-commerce, POS, PMS or accounting integrations;
- legal and compliance assessment;
- operational monitoring;
- clear go-to-market scope.

Possible future extensions include:

- merchant APIs;
- signed webhooks;
- SDK or checkout widgets;
- Shopify/WooCommerce plugins;
- POS/PMS integrations;
- ERP/accounting exports;
- EURC or additional stablecoin support;
- AI-assisted merchant analytics;
- privacy-preserving merchant reputation signals.

These are potential future directions, not current production commitments.

---

## Why publish this project

ArcPay is a builder prototype for stablecoin merchant payments on Arc. The goal is to demonstrate real-world payment patterns, not to claim production readiness.

The project explores how USDC, non-custodial wallets, smart contracts, payment references, receipts and merchant records can work together in a practical merchant payment layer.



---

## Author & project status

ArcPay is a personal testnet MVP designed and developed by **Mattia Santi** to explore how stablecoins, non-custodial smart contracts and verifiable payment records can support real-world merchant payment flows.

The project is independent, experimental and not affiliated with any employer, regulated financial institution, payment institution or blockchain foundation.

- LinkedIn: https://www.linkedin.com/in/mattiasantims/
- Repository: https://github.com/mattiasantims/ArcPay-testnet

---

## Disclaimer

ArcPay is a testnet MVP and technical/product exploration only. It is not a production payment service, regulated financial service, bank, custodial wallet, payroll processor, lending product, BNPL product, KYC provider or compliance verification tool.

Nothing in this repository should be interpreted as legal, financial, tax, investment or regulatory advice. Testnet tokens have no real economic value. Any potential mainnet or production path would require separate technical, security, legal, compliance and operational assessment.
