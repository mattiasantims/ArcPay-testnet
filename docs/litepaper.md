# ArcPay Litepaper

## Your keys. Your payments. Your policy. On-chain.

> ArcPay is an Arc Testnet proof of concept. Not a production payment service, regulated escrow, lending product, or compliance tool.

---

## Abstract

ArcPay is a merchant USDC payment prototype on Arc Testnet. It demonstrates how stablecoin-native merchant payments can go beyond raw transfers by providing instant receipts, programmable booking deposits, scheduled travel payment milestones, and — critically — on-chain merchant identity and publicly verifiable payment/refund policies.

Merchants define their payment terms in ArcMerchantRegistry. Customers read those terms before paying. Payment contracts execute those terms automatically. No fine print. No chargeback dispute. No opaque cancellation policy that can be changed at any time.

The product runs on four smart contracts and a pure frontend stack — no backend, no database, no server.

---

## The problem

**Payment infrastructure:** A raw USDC transfer proves value moved. Merchants need business-readable receipts with references, purpose codes, QR codes for physical checkout, payment links for remote payments, PDF/JSON records, and CSV reconciliation.

**Conditional payments:** Hotel bookings and travel packages need programmable escrow — refundable deposits, cancellation deadlines, scheduled payment tranches. A raw transfer cannot encode these terms.

**Merchant identity and policy transparency:** A hotel's cancellation policy on Booking.com is text that can be changed without notice. With ArcPay, a merchant publishes a `MerchantPolicy` struct on-chain. That policy version is immutable once committed. A customer paying today can verify the exact policy terms that applied — now and in the future.

---

## Architecture

```
ArcProof             — instant payment + receipt
ArcBookingEscrow     — hotel deposit escrow
ArcTravelEscrow      — travel scheduled payment
ArcMerchantRegistry  — merchant profile + policy (identity layer)
ArcPay frontend      — merchant UX + analytics
```

---

## The four payment flows

### Flow 1 — Online Payments

Merchant creates a payment link at `/create`. Customer opens in any browser, connects wallet, pays USDC. ArcProof executes the payment and creates a Payment Receipt atomically in the same transaction.

Purpose codes: Invoice · Service Payment · Donation · Retail Purchase · B2B Payment.

### Flow 2 — Luxury Retail Checkout

Merchant generates a QR or link at `/luxury` for physical in-store checkout. Customer scans with mobile wallet and pays. ArcProof receipt immediately.

### Flow 3 — Hotel Booking Deposit

Merchant creates a booking deposit link at `/booking`.

```
guest pays 100%
→ nonRefundableAmount  →  hotel immediately
→ refundableAmount     →  held in ArcBookingEscrow

before cancellationDeadline:
  guest or hotel calls cancelBeforeDeadline()
  → refundableAmount returned to guest

after cancellationDeadline:
  anyone calls releaseAfterDeadline()
  → refundableAmount released to hotel
```

Statuses: `Active` → `CancelledBeforeDeadline` or `ReleasedToMerchant`

### Flow 4 — Travel Agency Scheduled Payments

Travel agency creates a booking at `/travel`. Customer checkout shows two merchant-approved options:

**Option A — Pay full amount now**
→ ArcProof · full totalPackageAmount to agency · Payment Receipt generated · no escrow

**Option B — Pay initial + scheduled tranche**
→ ArcTravelEscrow manages the full lifecycle:

```
customer pays initialPaymentAmount today
→ nonRefundableAmount   →  agency immediately
→ refundableEscrowAmount → held in ArcTravelEscrow

on paymentDueDate:
  agency calls requestTranchePayment()

customer calls payTranche():
→ trancheAmount → agency directly
→ status: TranchePaid

if customer misses paymentDeadline:
  agency calls cancelForMissedPayment()
  → refundableEscrowAmount → agency (default protection)
  → status: CancelledForMissedPayment

after cancellationDeadline:
  anyone calls releaseAfterCancellationDeadline()
  → refundableEscrowAmount → agency
  → status: ReleasedToMerchant
```

**This is NOT lending. NOT BNPL. NOT consumer credit.** ArcPay does not advance funds to anyone. The agency receives funds only when the customer actually pays. The customer must have the initial payment available at booking time. The tranche must be paid by the customer when due.

The customer sees the tranche option only if the merchant explicitly enabled `allowScheduledTranche` in that specific booking request.

---

## The four smart contracts

### ArcProof

The foundational receipt primitive, created for this project. A single call to `payAndCreateProof()` executes the USDC transfer and creates a structured on-chain Payment Receipt atomically. Receipt includes: payer, payee, amount, payment reference, purpose code, metadata hash, block number, timestamp.

Deployed at: `0x9A284a4af4476Dddb353793A79C1a8BfC09e8334`

### ArcBookingEscrow

Manages hotel deposits with configurable split. `releaseAfterDeadline()` is permissionless — anyone can call it after the deadline. ERC-8183-inspired. Not ERC-8183-compliant.

Deployed at: `0xe83f411EaCe17C202598935cdD4E3646cD86899F`

### ArcTravelEscrow

Manages high-value travel bookings with:
- initial payment split into non-refundable (to agency) and refundable escrow
- one future scheduled tranche paid directly to agency — not escrowed, because it is a due payment after booking is active
- missed-payment cancellation: if the customer misses the tranche deadline, the agency can cancel and the refundable escrow is released to the agency as default protection — disclosed clearly in UI before payment
- permissionless release after cancellation deadline

Deploy yourself via Remix.

### ArcMerchantRegistry

Self-declared public merchant identity, linked wallets, and default payment/refund policy. Two structs:

**Merchant struct** — public business identity fields: trading name, legal name, business category, website, country, address, email, VAT/company ID, LEI, profile hash (changes on every update), profile version, active status, timestamps.

**MerchantPolicy struct** — default payment and refund settings:

| Field | Default | Meaning |
|-------|---------|---------|
| `allowScheduledTranche` | `false` | merchant accepts scheduled tranche by default |
| `defaultNonRefundableBps` | `3000` | 30% non-refundable on initial payment |
| `defaultInitialPaymentBps` | `1000` | 10% of total as initial payment (Travel) |
| `defaultTrancheBps` | `3000` | 30% of total as tranche (Travel) |
| `paymentDueOffsetDays` | `90` | tranche becomes due N days before travel |
| `paymentDeadlineOffsetDays` | `75` | tranche must be paid N days before travel (must be ≤ due offset) |
| `cancellationCutoffDays` | `30` | refund terms change N days before travel |
| `refundBpsBeforeCutoff` | `7000` | 70% refund if cancelled before cutoff |
| `refundBpsAfterCutoff` | `0` | 0% refund if cancelled after cutoff |
| `policyVersion` | `1` | increments on each `updateMerchantPolicy()` call |

Policy validation enforced on-chain: all BPS ≤ 10000, all day offsets ≤ 3650, `paymentDeadlineOffsetDays` ≤ `paymentDueOffsetDays`.

Policy defaults **pre-fill** new Hotel and Travel request forms. They do NOT automatically modify existing bookings or change contract behavior. Final terms for each booking are encoded in ArcBookingEscrow or ArcTravelEscrow at payment time.

On registration, a default `MerchantPolicy` is created automatically. The merchant can update it at any time via `updateMerchantPolicy()` — owner wallet only.

Deploy yourself via Remix.

---

## Merchant policy — why it matters on-chain

Booking.com can change its cancellation policy without notice. A merchant using ArcMerchantRegistry commits a `MerchantPolicy` on-chain with a `policyVersion`. That version is immutable once written. A customer can verify:

- what non-refundable percentage applies
- what the cancellation cutoff is
- what refund they get before and after the cutoff
- whether scheduled tranche payments are available
- the exact payment schedule offsets

These are not marketing claims or fine print. They are on-chain executable terms — the same terms that will govern their escrow if they choose to book.

**Merchant-defined policies. Customer-visible terms. On-chain execution.**

---

## Receipt types

ArcPay generates four receipt types across all payment flows:

**ArcProof Payment Receipt** — instant payment via `payAndCreateProof()`. Includes proof ID, payer, payee, amount, payment reference, purpose code, metadata hash, block, timestamp. PDF + JSON.

**Hotel Booking Receipt** — ArcBookingEscrow state. Includes booking ID, status, guest, hotel, total, non-refundable amount, refundable escrow, cancellation deadline, check-in date. PDF + JSON.

**Travel Booking Receipt** — ArcTravelEscrow state after initial payment. Includes travel ID, status, customer, agency, total package, initial payment, non-refundable, refundable escrow, scheduled tranche amount, payment due date, payment deadline, cancellation deadline, travel start. PDF + JSON.

**Tranche Payment Receipt** — ArcTravelEscrow state after `payTranche()`. Includes travel ID, travel reference, customer, agency, tranche amount, tranche paid timestamp. PDF + JSON.

ArcProof powers instant payment receipts. Escrow contracts generate lifecycle receipts through on-chain events and stored state.

---

## Multi-wallet merchant operations

A merchant can link multiple wallets to the same registry profile. Owner wallet registers and manages the profile and policy. Linked wallets can use the merchant profile for pre-filled ArcPay flows. Each wallet can belong to only one merchant.

Example: a travel agency links separate wallets for online payments, travel escrow deposits, and treasury — all under the same public merchant profile and policy.

---

## Merchant analytics

Live analytics at `/analytics`, reading from Arc Testnet on demand. No backend.

Tabs: Overview · Luxury Retail · Online Payments · Hotel Booking · Ask ArcPay AI · Coming Soon

**Ask ArcPay AI** — local dynamic assistant. No GPT/Claude. No external API. Answers computed from on-chain data loaded in the current session, updated on each refresh. Future: real AI integration via secure backend/serverless function, never exposing API keys in the browser.

---

## Privacy — public policy vs private analytics

**Public on-chain:** merchant identity and policy. These are equivalent to public booking/payment terms. Only publish what is already public or intended to be public.

**Private dashboard only:** total volume, transaction count, customer count, revenue trends, average ticket, booking behaviour. Never exposed publicly via the registry.

**Future reputation — privacy-preserving only:**
ArcMerchantRegistry creates the merchant identity anchor. ArcProof, ArcBookingEscrow, and ArcTravelEscrow create payment and settlement history. Future versions may derive privacy-preserving reputation signals without exposing sensitive business metrics.

Possible future public badges (no exact counts or volumes):
- Registered Merchant Profile
- Receipt-enabled Merchant
- Booking Escrow Enabled
- Scheduled Payments Enabled
- Refund Policy Published (with policy version)
- Multi-wallet Merchant
- Profile Active Since [Month/Year]
- Activity Tier: New / Active / Established

---

## Automation model

Smart contracts do not execute automatically at deadlines. All release, cancellation, and tranche request functions must be triggered by a transaction. In production, a keeper bot could monitor bookings and call time-sensitive functions automatically. The contracts enforce all deadlines on-chain — no early execution is possible regardless of who calls.

---

## Why Arc

- **USDC as native gas** — no separate gas token; fees in USDC
- **Sub-second finality** — receipts immutable in under one second
- **Atomic payment + receipt** — ArcProof creates payment and receipt in the same transaction
- **EVM-compatible** — standard Solidity, viem, wagmi, Web3Modal

Arc is built by Circle. ArcPay is not affiliated with Circle or Arc Network.

---

## Roadmap

Multi-tranche travel payments (ArcTravelEscrow v2) · Freelance Service Escrow (ERC-8183-aligned) · Marketplace Delivery Escrow · Donations/Milestone Funding · EURC/multi-stablecoin · x402/API payments · ERC-8004-inspired agent profiles · Real GPT/Claude merchant copilot via secure backend · PMS/POS/ERP integrations · Privacy-preserving reputation badges · Backend tranche payment notifications

---

## Limitations

- Testnet only — no real economic value
- ArcTravelEscrow: one tranche only in v0.1; tranche refund if already paid to agency is outside contract scope
- ArcMerchantRegistry: self-declared only — not verified
- Policy defaults pre-fill forms only — no automatic contract modification
- No backend analytics, no session tracking, no conversion rates
- Ask ArcPay AI is local — not real GPT/Claude
- Smart contracts do not auto-execute at deadlines
- No KYC/AML/sanctions screening
- Not a regulated payment service, escrow, lending product, or consumer protection service
