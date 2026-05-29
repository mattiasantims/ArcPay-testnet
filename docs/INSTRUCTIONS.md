# ArcPay — Instructions

This guide explains how to run and test ArcPay on Arc Testnet.

ArcPay is a testnet MVP. It is not a production payment service, regulated payment institution, custodial wallet, bank, payroll processor, lending product, BNPL product or compliance verification tool.

---

## 1. Network setup

ArcPay runs on Arc Testnet.

```text
Network name: Arc Testnet
RPC URL:      https://rpc.testnet.arc.network
Chain ID:     5042002
Symbol:       USDC
Explorer:     https://testnet.arcscan.app
```

USDC ERC-20 token:

```text
0x3600000000000000000000000000000000000000
```

Testnet USDC faucet:

```text
https://faucet.circle.com
```

---

## 2. Local development

```bash
npm install --legacy-peer-deps
npm run dev
npm run build
```

Vercel:

```text
Framework: Vite
Build command: npm run build
Output directory: dist
```

Environment variable:

```text
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
```

The repository intentionally avoids relying on `package-lock.json` if Vercel install issues occur.

---

## 3. Deployed contracts

Current Arc Testnet addresses:

```text
ArcProof:              0x1c5DAc22997FFD5CAf81f9A3d81F5258587788a3
ArcBookingEscrow:      0xd47E321a220B5aE86eb45d4c744C5E087aAa8d0C
ArcTravelEscrow:       0x894142646064CA2bBc8fE1e5E433E20a9DC2B024
ArcMerchantRegistry:   0xcfA93Ec583ff0cecB74eB02F9a18939D5609E303
ArcPaymentCommitment:  0xC19d95C36C83F88082127204Fe32D5Cd8F838039
ArcRefund:             0x0ad3F01645c419fc42dAef4ecF5A7213A8a030dC
ArcMerchantPayouts:    0x70D9407b5C6fbE2b74C4E65221edCDBF4A74fA93
```

If a contract is redeployed, update:

```text
src/config.js
src/abis/<ContractName>.json
```

Redeploying a contract creates a new empty state for that module. Existing test data remains on the old address and will not appear in the frontend unless the old address is restored.

---

## 4. Recommended test wallets

Use at least two wallets:

```text
Wallet A: merchant
Wallet B: customer / counterparty
```

For payout and refund tests, both wallets should hold test USDC.

---

## 5. Merchant profile and policy

Route:

```text
/merchant-profile
```

Test flow:

1. Connect merchant wallet.
2. Register merchant profile.
3. Set default policy values.
4. Enable/disable delayed payment, tranche payment and refund claim settings.
5. Save policy.
6. Refresh page.
7. Verify policy version and values persist.

Important policy timing note:

Hotel/travel default offsets in the Merchant Profile are measured as minutes before a future travel/service date.

Example:

```text
Payment due offset:      5 min before travel/service date
Payment deadline offset: 3 min before travel/service date
Cancellation cutoff:     2 min before travel/service date
```

This means the temporal order is:

```text
payment due -> payment deadline -> cancellation cutoff -> travel/service date
```

Higher offset means earlier date.

Individual use case forms can still be manually overridden for demo testing.

---

## 6. Online payments

Routes:

```text
/create
/pay
/receipt/:id
/dashboard
/my-payments
```

Test flow:

1. Merchant creates a payment link.
2. Customer opens the link.
3. Customer approves USDC.
4. Customer pays.
5. Verify receipt page, PDF, CSV and ArcScan link.
6. Test refund request, refund denial, refund approval and direct refund.

Expected records:

- payment reference;
- merchant wallet;
- customer wallet;
- amount;
- refund status if any;
- relevant transaction hashes;
- ArcScan links.

---

## 7. Luxury and high-value retail

Route:

```text
/luxury
```

Test flow:

1. Merchant creates QR/link.
2. Customer pays or signs delayed/tranche commitment where applicable.
3. Verify merchant view and customer/counterparty view.
4. Test refund flows.
5. Verify PDF/CSV/ArcScan.

Luxury is the demo area for high-value retail scenarios such as delayed payment and tranche payment.

---

## 8. Hotel booking deposits

Routes:

```text
/booking
/booking/pay
/booking-dashboard
/my-bookings
/booking/:id
```

Test flow:

1. Merchant creates booking deposit link.
2. Customer pays booking deposit.
3. Verify creation receipt and CSV.
4. Test cancellation before deadline.
5. Test escrow release after deadline.
6. Verify merchant CSV and customer CSV include creation/cancel/release transaction hashes.

---

## 9. Travel payment flows

Routes:

```text
/travel
/travel/pay
/travel-dashboard
/my-travel
/travel/:id
```

Test flow:

1. Merchant creates travel payment request.
2. Test full payment now.
3. Test scheduled tranche flow.
4. For scheduled tranche:
   - customer pays initial payment;
   - merchant requests tranche when due;
   - customer pays tranche;
   - merchant releases or cancels according to deadlines.
5. Verify dashboard, PDF, CSV and ArcScan links.

Current limitation:

Full payment now is processed as an instant payment flow. More advanced travel-specific cancellation logic for full upfront travel payments may be considered in a later version.

---

## 10. Merchant payouts

Routes:

```text
/payouts
/payout-dashboard
/payout/:id
/my-payouts
```

Test flow:

1. Merchant creates counterparty alias.
2. Merchant edits or deactivates alias if needed.
3. Merchant creates a single payout.
4. Merchant approves USDC to `ArcMerchantPayouts`.
5. Merchant executes payout.
6. Counterparty opens `/my-payouts`.
7. Verify PDF, CSV and ArcScan link.
8. Test batch payout.

Counterparty registry warning:

Use aliases only. Do not store personal, payroll, tax or confidential information on-chain.

Recommended aliases:

```text
SUPPLIER-001
CONTRACTOR-002
TEAM-001
```

Do not store:

```text
real names
personal emails
tax IDs
addresses
payroll details
employment details
invoice documents
private contracts
confidential notes
```

---

## 11. Dashboard performance

The current demo reads data from smart contracts and events directly in the browser.

As test data grows, dashboards may take longer to load.

This is acceptable for testnet demonstration, but a production-grade version would require:

- event indexer;
- backend database;
- API layer;
- pagination;
- caching;
- webhook delivery;
- monitoring.

---

## 12. Go-live checklist for testnet demo

Before sharing publicly:

- Vercel deploy succeeds.
- Homepage loads.
- Merchant and counterparty pages load.
- Wallet connect works.
- Online payment flow works.
- Luxury flow works.
- Hotel creation/cancel/release works.
- Travel flow works at least for the demo scenario.
- Payout single and batch work.
- Refund denied/approved/direct refund statuses are correct.
- PDFs show correct title/status.
- CSVs show correct references and transaction hashes.
- Public wording does not claim production readiness, regulatory status, KYC/AML coverage, custody or guaranteed refunds.

---

## 13. Production-readiness note

A mainnet or production version would require a separate evaluation.

Not every testnet demo should or will become a mainnet application.

Before any live production deployment, ArcPay would need:

- contract security review;
- data/indexing infrastructure;
- backend/API design;
- signed webhook design;
- legal and compliance review;
- merchant onboarding model;
- operational support model;
- incident handling process;
- privacy review;
- performance hardening.


---

## 14. Author and repository

ArcPay is a personal testnet MVP developed by **Mattia Santi**.

- LinkedIn: https://www.linkedin.com/in/mattiasantims/
- GitHub profile: https://github.com/mattiasantims
- Repository: https://github.com/mattiasantims/ArcPay-testnet

The project is independent and experimental. It does not represent any employer, regulated financial institution, payment institution or blockchain foundation.

