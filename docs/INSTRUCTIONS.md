# ArcPay — Instructions

## Architecture

```
ArcPay
├── ArcProof.sol              (deployed) — instant payment receipt engine
│   ├── Online Payments       /create → /pay → /receipt
│   ├── Luxury Retail         /luxury → /pay → /receipt
│   └── Travel "Pay full now" /travel/pay → /receipt
│
├── ArcBookingEscrow.sol      (deployed) — hotel booking engine
│   └── Hotel Booking         /booking → /booking/pay → /booking/:id
│
├── ArcTravelEscrow.sol       (deploy yourself) — travel scheduled payment engine
│   └── Travel "Pay tranche"  /travel/pay → /travel/:id
│
├── ArcMerchantRegistry.sol   (deploy yourself) — merchant profile + policy
│   └── Merchant Profile      /merchant-profile
│
└── Analytics                 /analytics (reads from all contracts)
```

\---

## Prerequisites

* MetaMask browser extension
* Arc Testnet configured in MetaMask (see below)
* Testnet USDC from Circle faucet
* Two wallets for merchant/customer flows
* WalletConnect Project ID (free at cloud.walletconnect.com)
* GitHub + Vercel
* Remix IDE for contract deployment

\---

## Arc Testnet — MetaMask setup

```
Network name:  Arc Testnet
RPC URL:       https://rpc.testnet.arc.network
Chain ID:      5042002
Symbol:        USDC
Explorer:      https://testnet.arcscan.app
```

Note: Arc native gas uses 18 decimals internally. ERC-20 USDC for transfers uses 6 decimals.

Testnet USDC: https://faucet.circle.com → Arc Testnet → paste wallet address.

\---

## Install and run

```bash
npm install --legacy-peer-deps
npm run dev      # local development
npm run build    # production build
```

Vercel settings:

```
Framework:  Vite
Build:      npm run build
Output:     dist
```

Environment variable (Vercel project settings):

```
VITE\_WALLETCONNECT\_PROJECT\_ID = your\_walletconnect\_project\_id
```

\---

## Deploy ArcTravelEscrow

1. Open https://remix.ethereum.org
2. New file → paste `contracts/ArcTravelEscrow.sol`
3. Solidity Compiler tab → version 0.8.20+ → Compile
4. Deploy \& Run tab → Environment: Injected Provider - MetaMask
5. MetaMask must be on Arc Testnet (Chain ID 5042002)
6. Contract: ArcTravelEscrow → Deploy → confirm in MetaMask
7. Copy deployed address from Deployed Contracts
8. Update `src/config.js`:

```js
   export const ARCTRAVEL\_ESCROW\_ADDRESS = '0xYOUR\_ADDRESS'
   ```

## Deploy ArcMerchantRegistry

Same process with `contracts/ArcMerchantRegistry.sol`:

```js
export const ARCMERCHANT\_REGISTRY\_ADDRESS = '0xYOUR\_ADDRESS'
```

ArcProof (`0x9A28...`) and ArcBookingEscrow (`0xe83f...`) are already deployed. Do not redeploy.

\---

## Wallet connection

**Desktop:** Click **Connect** → MetaMask opens → approve → ArcPay auto-switches to Arc Testnet.

**Mobile (WalletConnect):** Click **Connect** → Web3Modal opens → choose WalletConnect → scan QR with MetaMask Mobile, Rainbow, Trust Wallet, or any WalletConnect-compatible wallet.

**Mobile — paying:** Open payment/booking link inside MetaMask Mobile's built-in browser tab.

**Wallet menu** (click address top-right when connected):
Merchant Profile · Copy address · Switch wallet · Disconnect

\---

## Test: Online Payments

Wallet A = merchant · Wallet B = customer

1. Connect Wallet A → **Accept USDC → Online Payments** → `/create`
2. Enter name, amount, payment reference, purpose code, description
3. Payment method: 💳 Card (disabled) · ◆ USDC (active)
4. Click **Generate Payment Link + QR**
5. Open link in new tab or send to Wallet B
6. Wallet B: select **Pay with USDC** → connect → approve USDC → pay (2 MetaMask confirmations)
7. Receipt at `/receipt/:id` → download PDF + JSON
8. Check `/dashboard` → payment visible → Export CSV

\---

## Test: Luxury Retail

1. Connect Wallet A → **Accept USDC → Luxury Retail** → `/luxury`
2. Enter purchase details → generate QR/link
3. Wallet B: open checkout → select **Pay with USDC** → pay
4. ArcProof receipt → check `/dashboard`

\---

## Test: Hotel Booking Deposit

Wallet A = hotel · Wallet B = guest

### Create booking

1. Connect Wallet A → **Accept USDC → Hotel Booking** → `/booking`
2. Enter: hotel name, amount (e.g. 3 USDC), non-refundable % (e.g. 30%)
3. Select **2 min (demo)** deadline preset
4. Click **Generate Booking Deposit Link** → copy

### Guest pays

1. Wallet B opens link → select **Pay with USDC** → connect → pay (2 confirmations)
2. Verify: 0.90 USDC (30%) → Wallet A immediately · 2.10 USDC (70%) → escrow · status: Active

### Test: cancel before deadline

1. Wallet B opens `/booking/:id` before 2-minute deadline
2. Click **Cancel booking** → confirm
3. Verify: 2.10 USDC refundable → Wallet B · status: CancelledBeforeDeadline

### Test: hotel processes cancellation

1. Wallet A opens `/booking-dashboard` → Hotel view → Upcoming Deadlines
2. Click **Process guest cancellation** before deadline → confirm
3. Verify: refundable → guest

### Test: release after deadline

1. Wait for 2-minute deadline to pass
2. `/booking-dashboard` → Ready to Release → click **Release escrow to hotel**
3. Verify: 2.10 USDC → Wallet A · status: ReleasedToMerchant

\---

## Test: Travel Agency Scheduled Payments

Wallet A = travel agency · Wallet B = customer

### Create travel booking

1. Connect Wallet A → **Accept USDC → Travel Agency** → `/travel`
2. Enter:

   * Agency name
   * Total package: e.g. 10 USDC
   * Initial payment today: e.g. 3 USDC
   * Non-refundable %: e.g. 30%
   * Scheduled tranche: e.g. 4 USDC
   * Toggle **Allow scheduled tranche for this booking**: ON
   * Click **Demo (2/5/10 min)** preset
3. Click **Generate Travel Booking Link** → copy

### Customer checkout — full payment

1. Wallet B opens link → select **Pay with USDC**
2. Payment options appear:

   * **Pay full amount now** (10 USDC · ArcProof · instant receipt)
   * **Pay initial + scheduled tranche** (3 USDC today · 4 USDC later · ArcTravelEscrow)
3. Select **Pay full amount now** → connect → pay (2 confirmations)
4. Verify: 10 USDC → Wallet A · ArcProof receipt at `/receipt/:id`

### Customer checkout — scheduled tranche

1. Create new booking link (re-create on `/travel`)
2. Wallet B opens link → select **Pay with USDC** → select **Pay initial + scheduled tranche**
3. Pay 3 USDC initial (2 confirmations)
4. Verify: 0.90 USDC (30%) → Wallet A immediately · 2.10 USDC → escrow · status: Active
5. Redirected to `/travel/:id`

### Agency requests tranche (after 2 min due date)

1. Wallet A opens `/travel/:id`
2. After due date: button **Request tranche payment** appears → click → confirm
3. Tranche is now marked as requested on-chain

### Customer pays tranche (before 5 min deadline)

1. Wallet B opens `/travel/:id`
2. Click **Pay tranche (4 USDC)** → approve USDC → confirm payment (2 confirmations)
3. Verify: 4 USDC → Wallet A · `tranchePaid: true` · status: TranchePaid

### Test: cancel before cancellation deadline (10 min)

1. Either Wallet A or Wallet B opens `/travel/:id` before 10-minute deadline
2. Click **Cancel booking (refund escrow)** → confirm
3. Verify: 2.10 USDC refundable escrow → Wallet B · status: CancelledBeforeDeadline
4. Note: if tranche was already paid to agency before cancellation, it is NOT automatically refunded (outside contract scope in v0.1)

### Test: agency cancels for missed payment

1. Wait for 5-minute tranche payment deadline to pass without paying tranche
2. Wallet A opens `/travel/:id`
3. Click **Cancel — missed payment** → confirm
4. Verify: 2.10 USDC refundable escrow → Wallet A as default protection · status: CancelledForMissedPayment

### Test: release after cancellation deadline

1. Wait for 10-minute cancellation deadline to pass
2. Open `/travel/:id` or `/travel-dashboard`
3. Click **Release escrow to agency** → confirm
4. Verify: remaining escrow → Wallet A · status: ReleasedToMerchant

### Travel receipts — from `/travel/:id`

* **Booking PDF / JSON** — Travel Booking Receipt (initial payment, escrow, full terms)
* **Tranche PDF / JSON** — Tranche Payment Receipt (visible only after tranche is paid)

### Travel dashboard

Go to `/travel-dashboard` → Agency view → load wallet address:

* Ready to Release · Overdue — Missed Payment · Awaiting Customer Payment
* Ready to Request · Upcoming · Tranche Paid · Closed

\---

## Test: Merchant Profile and Policy

### Register

1. Deploy ArcMerchantRegistry and update config (see above)
2. Connect wallet → wallet menu (top-right) → **Merchant Profile** → `/merchant-profile`
3. If not registered: registration form appears
4. Fill Trading Name (required), Business Category (required), optional fields
5. Read public data warning — only publish public business information
6. Click **Register on-chain** → confirm in MetaMask
7. Profile created · default MerchantPolicy automatically set · Merchant ID assigned

### Update profile

1. Owner wallet → `/merchant-profile` → click **Edit profile**
2. Update fields → **Update on-chain** → confirm
3. profileVersion increments · new profileHash computed

### View default policy

1. After registration: **Default Payment \& Refund Policy** section visible
2. Shows all 9 policy fields with current values and policyVersion

### Update policy

1. Owner wallet → `/merchant-profile` → click **Edit policy**
2. Configure:

   * **Allow scheduled tranche by default** (toggle On/Off)
   * **Non-refundable %** — e.g. 30 (applied to initial payment)
   * **Initial payment %** — e.g. 10 (% of total package for Travel)
   * **Tranche %** — e.g. 30 (% of total package for Travel)
   * **Payment due offset days** — e.g. 90 (days before travel/check-in)
   * **Payment deadline offset days** — e.g. 75 (must be ≤ due offset)
   * **Cancellation cutoff days** — e.g. 30 (days before travel/check-in)
   * **Refund % before cutoff** — e.g. 70
   * **Refund % after cutoff** — e.g. 0
3. Click **Save policy on-chain** → confirm in MetaMask
4. policyVersion increments

Important: policy changes do NOT modify existing bookings. They pre-fill new request forms only.

### Test policy prefill

1. Connect wallet linked to a merchant profile
2. Open `/travel` → observe prefill: agency name, allowScheduledTranche toggle, non-refundable %, initial %, tranche %, offset days
3. Open `/booking` → observe prefill: hotel name, non-refundable %
4. Open `/luxury` or `/create` → observe prefill: merchant name

### Add linked wallet

1. Owner wallet → `/merchant-profile` → Linked Wallets section
2. Enter wallet address → click **+ Add wallet** → confirm in MetaMask
3. Linked wallet can now use merchant profile prefills in all ArcPay flows

### Remove linked wallet

1. Owner wallet → Linked Wallets → click **Remove** next to wallet → confirm
2. Owner wallet cannot be removed

### Merchant lookup

In `/merchant-profile` → **Look up merchant** section:

* Enter wallet address → find merchant profile + policy summary
* Enter merchant ID number → find by ID

\---

## Test: Analytics

1. Connect wallet → **Reports → Analytics** → `/analytics`
2. Click **Refresh on-chain data**
3. Switch time filters: Today · Last 7 days · Last 30 days · Month to date · etc.
4. Browse tabs: Overview · Luxury Retail · Online Payments · Hotel Booking
5. Ask ArcPay AI: click predefined question buttons or type custom question
6. After creating new payments: click refresh to update metrics

\---

## Automation model — manual triggers in MVP

Smart contracts do not execute automatically. All time-sensitive functions require a transaction:

|Function|Who|When|
|-|-|-|
|`releaseAfterDeadline()` (Hotel)|Anyone|After hotel cancellation deadline|
|`releaseAfterCancellationDeadline()` (Travel)|Anyone|After travel cancellation deadline|
|`requestTranchePayment()` (Travel)|Agency only|After paymentDueDate, before paymentDeadline|
|`payTranche()` (Travel)|Customer only|Before paymentDeadline|
|`cancelForMissedPayment()` (Travel)|Agency only|After paymentDeadline, if tranche unpaid|

Dashboards surface all actionable bookings. In production, a keeper bot could call these automatically — the contracts enforce deadlines on-chain regardless.

\---

## Deployment checklist

* \[ ] `VITE\_WALLETCONNECT\_PROJECT\_ID` added to Vercel environment variables
* \[ ] `ARCPROOF\_ADDRESS = 0x9A284a4af4476Dddb353793A79C1a8BfC09e8334` confirmed in `src/config.js`
* \[ ] `ARCBOOKING\_ADDRESS = 0xe83f411EaCe17C202598935cdD4E3646cD86899F` confirmed in `src/config.js`
* \[ ] `ArcTravelEscrow.sol` deployed via Remix → `ARCTRAVEL\_ESCROW\_ADDRESS` updated
* \[ ] `ArcMerchantRegistry.sol` deployed via Remix → `ARCMERCHANT\_REGISTRY\_ADDRESS` updated
* \[ ] Push to GitHub → Vercel redeploys automatically
* \[ ] Test Online Payment (2 wallets, PDF + JSON receipt)
* \[ ] Test Luxury Retail (2 wallets)
* \[ ] Test Hotel Booking (2-min demo, guest cancel, hotel cancel, release)
* \[ ] Test Travel Booking — full payment option → ArcProof receipt
* \[ ] Test Travel Booking — scheduled tranche option (2/5/10 min demo)
* \[ ] Test tranche payment request + payment
* \[ ] Test travel missed payment cancellation
* \[ ] Test travel release after cancellation deadline
* \[ ] Test Travel Booking Receipt PDF + JSON
* \[ ] Test Tranche Payment Receipt PDF + JSON
* \[ ] Test Merchant Profile registration
* \[ ] Test Merchant Policy update (all 9 fields)
* \[ ] Test policy prefill in Travel, Hotel, Luxury, Online
* \[ ] Test linked wallets (add + remove)
* \[ ] Test merchant lookup by wallet and by ID
* \[ ] Test Analytics with real on-chain data
* \[ ] Test WalletConnect on mobile browser

\---

## Disclaimers

ArcPay is an Arc Testnet proof of concept. Testnet USDC has no real value. ArcTravelEscrow is not lending/financing/BNPL. ArcMerchantRegistry records self-declared information — not verified. Merchant policy defaults pre-fill forms only. No KYC/AML. Smart contracts do not auto-execute at deadlines. Not affiliated with Circle or Arc Network.

