# ArcPay Litepaper

## Stablecoin checkout, payout operations and verifiable records on Arc

ArcPay is a web-based testnet MVP exploring how stablecoins can support real-world merchant payment flows on Arc.

It combines USDC checkout, QR payments, booking deposits, travel payment flows, merchant payouts, refund workflows, merchant profiles, downloadable records and ArcScan verification into a lightweight non-custodial demo.

ArcPay is not a production payment service. It is not a bank, regulated payment institution, custodial wallet, payroll processor, lending product, BNPL product or compliance verification tool. Testnet tokens have no real economic value.

---

## 1. Product thesis

Stablecoins can become practical payment rails for merchants, but the user experience needs to become simpler and more business-readable.

A raw stablecoin transfer proves that value moved. It does not automatically provide:

- a merchant-friendly checkout experience;
- a booking reference;
- an invoice or payout reference;
- a refund or release event history;
- a PDF receipt;
- a CSV export;
- an internal reconciliation key;
- a counterparty-facing record.

ArcPay explores the layer between raw on-chain transfers and real merchant operations.

The product thesis is:

> Merchants should be able to move USDC without becoming crypto experts, while keeping verifiable payment records linked to off-chain business references.

---

## 2. Why stablecoins

Crypto-native assets are difficult for many merchants to use as payment instruments because of volatility. Stablecoins reduce that issue by creating payment flows denominated in a fiat-referenced asset.

For merchant use cases, stablecoins can support:

- wallet-to-wallet settlement;
- global reach;
- transparent transaction verification;
- programmable payment terms;
- lower volatility than non-stable crypto-assets;
- direct linkage between payment and business references.

ArcPay uses USDC on Arc Testnet to demonstrate these concepts.

---

## 3. Why Arc

ArcPay is built on Arc Testnet because Arc is designed around stablecoin-native and payment-oriented use cases.

For a merchant payment demo, this creates a useful environment:

- USDC is the core payment asset;
- transaction verification is available through ArcScan;
- payment logic can be expressed through EVM-compatible smart contracts;
- merchant workflows can be tested without using real-value tokens.

ArcPay uses Arc Testnet to explore what a stablecoin-native merchant layer could look like before any production or mainnet decision.

---

## 4. What ArcPay currently demonstrates

### 4.1 Online checkout

A merchant can create a hosted payment link or QR code for a USDC payment. The counterparty connects a wallet, approves USDC and completes the payment.

The payment is linked to a reference and can generate a receipt, CSV row and ArcScan link.

### 4.2 Luxury and high-value retail

ArcPay supports QR-based in-person payment flows for high-value environments such as boutiques, premium retail or dealer-style payments.

The demo also explores delayed payments, tranche payments and refund flows for high-value merchant contexts.

### 4.3 Hotel booking deposits

The hotel module demonstrates a booking deposit escrow:

- non-refundable portion to the merchant;
- refundable portion held in escrow;
- cancellation before the cutoff;
- release after the cutoff;
- event history;
- PDF and CSV records.

### 4.4 Travel payment flows

The travel module demonstrates full payment and scheduled-tranche payment options.

Scheduled payments are not lending, credit or BNPL. ArcPay does not advance funds. The merchant receives funds only when the customer actually pays.

### 4.5 Merchant payouts

ArcPay also supports outbound merchant payments.

Merchants can send USDC to suppliers, contractors, team wallets or other counterparties, individually or in batch.

Each payout can include:

- payment reference;
- description;
- purpose;
- recipient wallet;
- metadata hash;
- transaction hash;
- ArcScan link;
- PDF receipt;
- CSV record.

The counterparty can view received payouts and verify them on-chain.

---

## 5. Records and reconciliation

ArcPay treats payment records as a core part of the product.

Every supported payment or payout can be tied to a reference such as:

- order ID;
- invoice number;
- booking reference;
- travel reference;
- supplier payout reference;
- batch payout reference.

The on-chain transaction proves execution. The reference and metadata hash connect that transaction to off-chain records controlled by the merchant.

This allows the demo to represent a future direction for integration with accounting, ERP, POS, PMS or travel systems.

---

## 6. Merchant profile and policy

ArcPay includes an on-chain merchant registry for self-declared merchant profile information and default payment policy settings.

The registry does not verify merchant identity. It does not execute payments, hold funds or store commercial analytics.

It acts as a public anchor for:

- merchant profile data;
- linked merchant wallets;
- default travel and booking payment terms;
- refund claim settings;
- policy versioning.

Policy defaults pre-fill new flows. They do not modify existing bookings, payments or commitments.

---

## 7. Counterparty and privacy model

For payout use cases, ArcPay includes an alias-based counterparty registry.

The purpose is practical: merchants may need to pay a supplier, contractor or team wallet from a browser, phone or tablet without relying on a local CSV file.

However, the registry should not be treated as a place for sensitive data.

Counterparty aliases should be generic, such as:

- `SUPPLIER-001`;
- `CONTRACTOR-002`;
- `TEAM-001`.

The following should not be stored on-chain:

- real names of individuals;
- personal emails;
- tax IDs;
- addresses;
- payroll details;
- employment information;
- invoices;
- private contracts;
- confidential notes.

Detailed records should remain off-chain with the merchant and can be linked through payment references and metadata hashes.

---

## 8. Analytics

ArcPay includes web-based analytics views for the testnet demo.

The current analytics are local and on-chain driven. They are useful for demonstration but not optimized for large-scale production usage.

A future production version would likely require an indexer, backend database and API layer for:

- faster dashboard loading;
- pagination;
- historical queries;
- webhook delivery;
- reconciliation exports;
- operational monitoring.

---

## 9. Future directions

ArcPay’s current scope is a testnet MVP. A future production path would need to be evaluated separately.

Potential future directions include:

- hosted checkout APIs;
- signed webhooks;
- merchant API keys;
- JavaScript SDK or checkout widget;
- e-commerce plugins;
- POS and PMS integrations;
- ERP/accounting exports;
- EURC or additional stablecoin support;
- AI-assisted analytics;
- privacy-preserving reputation badges;
- backend indexing and data retrieval.

These are not current production commitments. They represent possible next steps if the prototype is taken beyond testnet.

---

## 10. Mainnet considerations

Not every testnet application becomes a mainnet product.

Moving ArcPay from testnet demo to mainnet would require more than deploying the same contracts to a live network.

A production-grade path would require:

- security review;
- contract hardening;
- test coverage;
- monitoring;
- indexed data infrastructure;
- API and webhook design;
- legal and regulatory assessment;
- clear merchant onboarding model;
- privacy and data handling controls;
- operational support;
- incident response planning.

The current MVP is therefore best understood as a working prototype and product exploration, not a launch-ready payment processor.

---


---

## Author and project status

ArcPay is a personal testnet MVP designed and developed by **Mattia Santi** as an independent exploration of stablecoin-native merchant payment flows on Arc Testnet.

The project reflects a builder/product experiment around non-custodial checkout, merchant payouts, on-chain payment proof and off-chain reconciliation records. It does not represent the views, strategy or official position of any employer, affiliated entity, regulated financial institution or blockchain foundation.

ArcPay is not a white paper for a token issuance, investment product or regulated financial service. It is a testnet prototype and should be read as a technical and product exploration.

## 11. Conclusion

ArcPay explores how stablecoin payments can become more useful for real-world merchants when combined with:

- checkout links;
- QR payments;
- escrow use cases;
- travel flows;
- outbound payouts;
- payment references;
- PDF and CSV records;
- ArcScan verification;
- merchant profiles;
- analytics.

The project is intentionally framed as a testnet MVP.

Its goal is to demonstrate a credible direction for stablecoin merchant workflows on Arc, not to overclaim production readiness.

