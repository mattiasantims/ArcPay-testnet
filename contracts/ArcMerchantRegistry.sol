// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// solc-flags: --via-ir --optimize --optimize-runs 200

/**
 * @title ArcMerchantRegistry v3
 * @notice Self-declared public merchant profile and default policy registry for ArcPay on Arc Testnet.
 *
 * v3 preserves the v2 merchant/profile model and appends advanced policy flags for:
 * - delayed online/luxury payment commitments;
 * - online/luxury tranche commitments;
 * - merchant-managed refund claims.
 *
 * The registry does NOT verify merchant identity, does NOT execute payments,
 * does NOT hold funds, and does NOT store commercial analytics.
 * Policy defaults pre-fill ArcPay forms only. They do not modify existing payments,
 * bookings, commitments or refund requests.
 */
contract ArcMerchantRegistry {

    struct Merchant {
        uint256 merchantId;
        address ownerWallet;
        string  tradingName;
        string  legalName;
        string  businessCategory;
        string  website;
        string  country;
        string  businessAddress;
        string  businessEmail;
        string  lei;
        string  vatOrCompanyId;
        string  otherPublicIdentifier;
        bytes32 profileHash;
        uint256 profileVersion;
        bool    active;
        uint256 createdAt;
        uint256 updatedAt;
    }

    struct MerchantPolicy {
        // v2 fields, kept in the same order for frontend compatibility
        bool    allowScheduledTranche;
        uint256 defaultNonRefundableBps;
        uint256 defaultInitialPaymentBps;
        uint256 defaultTrancheBps;
        uint256 paymentDueOffsetDays;          // minutes on testnet
        uint256 paymentDeadlineOffsetDays;     // minutes on testnet; <= due offset when offsets are measured before travel/service date
        uint256 cancellationCutoffDays;        // minutes on testnet
        uint256 refundBpsBeforeCutoff;
        uint256 refundBpsAfterCutoff;

        // v3 fields, appended only
        bool    allowDelayedPayment;
        uint256 defaultDelayedPaymentDays;       // minutes on testnet
        bool    allowOnlineTranche;
        uint256 defaultOnlineTrancheBps;         // BPS first online/luxury tranche
        uint256 defaultOnlineTrancheOffsetDays;  // minutes on testnet
        bool    allowRefundClaim;
        uint256 refundClaimWindowDays;           // minutes on testnet
        uint256 refundClaimBps;                  // maximum BPS requested through the refund-claim UI

        // metadata
        uint256 policyVersion;
        uint256 updatedAt;
    }

    uint256 public merchantCounter;

    mapping(uint256 => Merchant)       private merchants;
    mapping(uint256 => MerchantPolicy) private merchantPolicies;
    mapping(address => uint256)        public  walletToMerchantId;
    mapping(uint256 => address[])      private merchantWallets;

    event MerchantRegistered(uint256 indexed merchantId, address indexed ownerWallet, bytes32 profileHash, uint256 timestamp);
    event MerchantProfileUpdated(uint256 indexed merchantId, uint256 indexed profileVersion, bytes32 oldProfileHash, bytes32 newProfileHash, uint256 timestamp);
    event MerchantPolicyUpdated(uint256 indexed merchantId, uint256 indexed policyVersion, bool allowScheduledTranche, uint256 timestamp);
    event MerchantWalletAdded(uint256 indexed merchantId, address indexed wallet, uint256 timestamp);
    event MerchantWalletRemoved(uint256 indexed merchantId, address indexed wallet, uint256 timestamp);
    event MerchantDeactivated(uint256 indexed merchantId, uint256 timestamp);

    // ─── Validation helpers ───────────────────────────────────────────────────

    function _validateLengths1(
        string calldata tradingName,
        string calldata legalName,
        string calldata businessCategory,
        string calldata website,
        string calldata country
    ) internal pure {
        require(bytes(tradingName).length > 0,        "tradingName required");
        require(bytes(businessCategory).length > 0,   "businessCategory required");
        require(bytes(tradingName).length <= 96,      "tradingName too long");
        require(bytes(legalName).length <= 128,       "legalName too long");
        require(bytes(businessCategory).length <= 64, "businessCategory too long");
        require(bytes(website).length <= 160,         "website too long");
        require(bytes(country).length <= 64,          "country too long");
    }

    function _validateLengths2(
        string calldata businessAddress,
        string calldata businessEmail,
        string calldata lei,
        string calldata vatOrCompanyId,
        string calldata otherPublicIdentifier
    ) internal pure {
        require(bytes(businessAddress).length <= 180,      "businessAddress too long");
        require(bytes(businessEmail).length <= 128,        "businessEmail too long");
        require(bytes(lei).length <= 32,                   "lei too long");
        require(bytes(vatOrCompanyId).length <= 64,        "vatOrCompanyId too long");
        require(bytes(otherPublicIdentifier).length <= 96, "otherPublicIdentifier too long");
    }

    function _validateBps(
        uint256 defaultNonRefundableBps,
        uint256 defaultInitialPaymentBps,
        uint256 defaultTrancheBps,
        uint256 refundBpsBeforeCutoff,
        uint256 refundBpsAfterCutoff,
        uint256 defaultOnlineTrancheBps,
        uint256 refundClaimBps
    ) internal pure {
        require(defaultNonRefundableBps <= 10000,  "defaultNonRefundableBps > 10000");
        require(defaultInitialPaymentBps <= 10000, "defaultInitialPaymentBps > 10000");
        require(defaultTrancheBps <= 10000,        "defaultTrancheBps > 10000");
        require(refundBpsBeforeCutoff <= 10000,    "refundBpsBeforeCutoff > 10000");
        require(refundBpsAfterCutoff <= 10000,     "refundBpsAfterCutoff > 10000");
        require(defaultOnlineTrancheBps <= 10000,  "defaultOnlineTrancheBps > 10000");
        require(refundClaimBps <= 10000,           "refundClaimBps > 10000");
    }

    function _validatePolicy(
        uint256 defaultNonRefundableBps,
        uint256 defaultInitialPaymentBps,
        uint256 defaultTrancheBps,
        uint256 paymentDueOffsetDays,
        uint256 paymentDeadlineOffsetDays,
        uint256 cancellationCutoffDays,
        uint256 refundBpsBeforeCutoff,
        uint256 refundBpsAfterCutoff,
        uint256 defaultDelayedPaymentDays,
        uint256 defaultOnlineTrancheBps,
        uint256 defaultOnlineTrancheOffsetDays,
        bool allowRefundClaim,
        uint256 refundClaimWindowDays,
        uint256 refundClaimBps
    ) internal pure {
        _validateBps(
            defaultNonRefundableBps,
            defaultInitialPaymentBps,
            defaultTrancheBps,
            refundBpsBeforeCutoff,
            refundBpsAfterCutoff,
            defaultOnlineTrancheBps,
            refundClaimBps
        );

        // Existing v2 ArcPay semantics: offsets are minutes/days before a future service/travel date.
        // A larger offset means an earlier date, therefore the payment deadline offset must be <= due offset.
        require(paymentDueOffsetDays <= 3650,             "paymentDueOffsetDays > 3650");
        require(paymentDeadlineOffsetDays <= 3650,        "paymentDeadlineOffsetDays > 3650");
        require(cancellationCutoffDays <= 3650,           "cancellationCutoffDays > 3650");
        require(defaultDelayedPaymentDays <= 3650,        "defaultDelayedPaymentDays > 3650");
        require(defaultOnlineTrancheOffsetDays <= 3650,   "defaultOnlineTrancheOffsetDays > 3650");
        require(paymentDeadlineOffsetDays <= paymentDueOffsetDays, "paymentDeadlineOffsetDays must be <= paymentDueOffsetDays");

        if (allowRefundClaim) {
            require(refundClaimWindowDays > 0, "refundClaimWindowDays required");
            require(refundClaimBps > 0,        "refundClaimBps required");
        }
        require(refundClaimWindowDays <= 3650, "refundClaimWindowDays > 3650");
    }

    // ─── Storage helpers ──────────────────────────────────────────────────────

    function _storeMerchantStrings1(
        uint256 mid,
        string calldata tradingName,
        string calldata legalName,
        string calldata businessCategory,
        string calldata website,
        string calldata country
    ) internal {
        merchants[mid].tradingName      = tradingName;
        merchants[mid].legalName        = legalName;
        merchants[mid].businessCategory = businessCategory;
        merchants[mid].website          = website;
        merchants[mid].country          = country;
    }

    function _storeMerchantStrings2(
        uint256 mid,
        string calldata businessAddress,
        string calldata businessEmail,
        string calldata lei,
        string calldata vatOrCompanyId,
        string calldata otherPublicIdentifier
    ) internal {
        merchants[mid].businessAddress       = businessAddress;
        merchants[mid].businessEmail         = businessEmail;
        merchants[mid].lei                   = lei;
        merchants[mid].vatOrCompanyId        = vatOrCompanyId;
        merchants[mid].otherPublicIdentifier = otherPublicIdentifier;
    }

    function _computeHash(
        address owner,
        string calldata tradingName,
        string calldata legalName,
        string calldata businessCategory,
        string calldata website,
        string calldata country,
        string calldata businessAddress,
        string calldata businessEmail,
        string calldata lei,
        string calldata vatOrCompanyId,
        string calldata otherPublicIdentifier,
        uint256 version
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(
            owner, tradingName, legalName, businessCategory, website, country,
            businessAddress, businessEmail, lei, vatOrCompanyId, otherPublicIdentifier,
            block.chainid, version
        ));
    }

    // ─── Write functions ──────────────────────────────────────────────────────

    function registerMerchant(
        string calldata tradingName,
        string calldata legalName,
        string calldata businessCategory,
        string calldata website,
        string calldata country,
        string calldata businessAddress,
        string calldata businessEmail,
        string calldata lei,
        string calldata vatOrCompanyId,
        string calldata otherPublicIdentifier
    ) external returns (uint256 merchantId) {
        require(walletToMerchantId[msg.sender] == 0, "Wallet already linked to a merchant");

        _validateLengths1(tradingName, legalName, businessCategory, website, country);
        _validateLengths2(businessAddress, businessEmail, lei, vatOrCompanyId, otherPublicIdentifier);

        merchantCounter++;
        merchantId = merchantCounter;

        merchants[merchantId].merchantId     = merchantId;
        merchants[merchantId].ownerWallet    = msg.sender;
        merchants[merchantId].profileVersion = 1;
        merchants[merchantId].active         = true;
        merchants[merchantId].createdAt      = block.timestamp;
        merchants[merchantId].updatedAt      = block.timestamp;

        _storeMerchantStrings1(merchantId, tradingName, legalName, businessCategory, website, country);
        _storeMerchantStrings2(merchantId, businessAddress, businessEmail, lei, vatOrCompanyId, otherPublicIdentifier);

        bytes32 hash = _computeHash(
            msg.sender,
            tradingName,
            legalName,
            businessCategory,
            website,
            country,
            businessAddress,
            businessEmail,
            lei,
            vatOrCompanyId,
            otherPublicIdentifier,
            1
        );
        merchants[merchantId].profileHash = hash;

        merchantPolicies[merchantId] = MerchantPolicy({
            allowScheduledTranche: false,
            defaultNonRefundableBps: 3000,
            defaultInitialPaymentBps: 1000,
            defaultTrancheBps: 3000,
            paymentDueOffsetDays: 90,
            paymentDeadlineOffsetDays: 75,
            cancellationCutoffDays: 30,
            refundBpsBeforeCutoff: 7000,
            refundBpsAfterCutoff: 0,
            allowDelayedPayment: false,
            defaultDelayedPaymentDays: 30,
            allowOnlineTranche: false,
            defaultOnlineTrancheBps: 5000,
            defaultOnlineTrancheOffsetDays: 15,
            allowRefundClaim: false,
            refundClaimWindowDays: 14,
            refundClaimBps: 10000,
            policyVersion: 1,
            updatedAt: block.timestamp
        });

        walletToMerchantId[msg.sender] = merchantId;
        merchantWallets[merchantId].push(msg.sender);

        emit MerchantRegistered(merchantId, msg.sender, hash, block.timestamp);
        emit MerchantPolicyUpdated(merchantId, 1, false, block.timestamp);
    }

    function updateMerchantProfile(
        string calldata tradingName,
        string calldata legalName,
        string calldata businessCategory,
        string calldata website,
        string calldata country,
        string calldata businessAddress,
        string calldata businessEmail,
        string calldata lei,
        string calldata vatOrCompanyId,
        string calldata otherPublicIdentifier
    ) external {
        uint256 mid = walletToMerchantId[msg.sender];
        require(mid != 0, "No merchant linked to this wallet");
        require(merchants[mid].ownerWallet == msg.sender, "Not owner wallet");
        require(merchants[mid].active, "Merchant not active");

        _validateLengths1(tradingName, legalName, businessCategory, website, country);
        _validateLengths2(businessAddress, businessEmail, lei, vatOrCompanyId, otherPublicIdentifier);

        bytes32 oldHash = merchants[mid].profileHash;
        uint256 newVersion = merchants[mid].profileVersion + 1;
        bytes32 newHash = _computeHash(
            msg.sender,
            tradingName,
            legalName,
            businessCategory,
            website,
            country,
            businessAddress,
            businessEmail,
            lei,
            vatOrCompanyId,
            otherPublicIdentifier,
            newVersion
        );

        _storeMerchantStrings1(mid, tradingName, legalName, businessCategory, website, country);
        _storeMerchantStrings2(mid, businessAddress, businessEmail, lei, vatOrCompanyId, otherPublicIdentifier);

        merchants[mid].profileHash    = newHash;
        merchants[mid].profileVersion = newVersion;
        merchants[mid].updatedAt      = block.timestamp;

        emit MerchantProfileUpdated(mid, newVersion, oldHash, newHash, block.timestamp);
    }

    function updateMerchantPolicy(
        bool allowScheduledTranche,
        uint256 defaultNonRefundableBps,
        uint256 defaultInitialPaymentBps,
        uint256 defaultTrancheBps,
        uint256 paymentDueOffsetDays,
        uint256 paymentDeadlineOffsetDays,
        uint256 cancellationCutoffDays,
        uint256 refundBpsBeforeCutoff,
        uint256 refundBpsAfterCutoff,
        bool allowDelayedPayment,
        uint256 defaultDelayedPaymentDays,
        bool allowOnlineTranche,
        uint256 defaultOnlineTrancheBps,
        uint256 defaultOnlineTrancheOffsetDays,
        bool allowRefundClaim,
        uint256 refundClaimWindowDays,
        uint256 refundClaimBps
    ) external {
        uint256 mid = walletToMerchantId[msg.sender];
        require(mid != 0, "No merchant linked to this wallet");
        require(merchants[mid].ownerWallet == msg.sender, "Not owner wallet");
        require(merchants[mid].active, "Merchant not active");

        _validatePolicy(
            defaultNonRefundableBps,
            defaultInitialPaymentBps,
            defaultTrancheBps,
            paymentDueOffsetDays,
            paymentDeadlineOffsetDays,
            cancellationCutoffDays,
            refundBpsBeforeCutoff,
            refundBpsAfterCutoff,
            defaultDelayedPaymentDays,
            defaultOnlineTrancheBps,
            defaultOnlineTrancheOffsetDays,
            allowRefundClaim,
            refundClaimWindowDays,
            refundClaimBps
        );

        MerchantPolicy storage pol = merchantPolicies[mid];
        uint256 newPolicyVersion = pol.policyVersion + 1;

        pol.allowScheduledTranche = allowScheduledTranche;
        pol.defaultNonRefundableBps = defaultNonRefundableBps;
        pol.defaultInitialPaymentBps = defaultInitialPaymentBps;
        pol.defaultTrancheBps = defaultTrancheBps;
        pol.paymentDueOffsetDays = paymentDueOffsetDays;
        pol.paymentDeadlineOffsetDays = paymentDeadlineOffsetDays;
        pol.cancellationCutoffDays = cancellationCutoffDays;
        pol.refundBpsBeforeCutoff = refundBpsBeforeCutoff;
        pol.refundBpsAfterCutoff = refundBpsAfterCutoff;
        pol.allowDelayedPayment = allowDelayedPayment;
        pol.defaultDelayedPaymentDays = defaultDelayedPaymentDays;
        pol.allowOnlineTranche = allowOnlineTranche;
        pol.defaultOnlineTrancheBps = defaultOnlineTrancheBps;
        pol.defaultOnlineTrancheOffsetDays = defaultOnlineTrancheOffsetDays;
        pol.allowRefundClaim = allowRefundClaim;
        pol.refundClaimWindowDays = refundClaimWindowDays;
        pol.refundClaimBps = refundClaimBps;
        pol.policyVersion = newPolicyVersion;
        pol.updatedAt = block.timestamp;

        emit MerchantPolicyUpdated(mid, newPolicyVersion, allowScheduledTranche, block.timestamp);
    }

    function addWallet(address wallet) external {
        uint256 mid = walletToMerchantId[msg.sender];
        require(mid != 0, "No merchant linked to this wallet");
        require(merchants[mid].ownerWallet == msg.sender, "Not owner wallet");
        require(merchants[mid].active, "Merchant not active");
        require(wallet != address(0), "Invalid wallet address");
        require(walletToMerchantId[wallet] == 0, "Wallet already linked to a merchant");

        walletToMerchantId[wallet] = mid;
        merchantWallets[mid].push(wallet);
        emit MerchantWalletAdded(mid, wallet, block.timestamp);
    }

    function removeWallet(address wallet) external {
        uint256 mid = walletToMerchantId[msg.sender];
        require(mid != 0, "No merchant linked to this wallet");
        require(merchants[mid].ownerWallet == msg.sender, "Not owner wallet");
        require(wallet != merchants[mid].ownerWallet, "Cannot remove owner wallet");
        require(walletToMerchantId[wallet] == mid, "Wallet not linked to this merchant");

        delete walletToMerchantId[wallet];
        address[] storage wallets = merchantWallets[mid];
        for (uint256 i = 0; i < wallets.length; i++) {
            if (wallets[i] == wallet) {
                wallets[i] = wallets[wallets.length - 1];
                wallets.pop();
                break;
            }
        }
        emit MerchantWalletRemoved(mid, wallet, block.timestamp);
    }

    function deactivateMerchant() external {
        uint256 mid = walletToMerchantId[msg.sender];
        require(mid != 0, "No merchant linked to this wallet");
        require(merchants[mid].ownerWallet == msg.sender, "Not owner wallet");
        require(merchants[mid].active, "Already deactivated");
        merchants[mid].active = false;
        merchants[mid].updatedAt = block.timestamp;
        emit MerchantDeactivated(mid, block.timestamp);
    }

    // ─── Read functions ───────────────────────────────────────────────────────

    function getMerchant(uint256 merchantId) external view returns (Merchant memory) {
        require(merchantId > 0 && merchantId <= merchantCounter, "Merchant does not exist");
        return merchants[merchantId];
    }

    function getMerchantByWallet(address wallet) external view returns (Merchant memory) {
        uint256 mid = walletToMerchantId[wallet];
        require(mid != 0, "Wallet not linked to any merchant");
        return merchants[mid];
    }

    function getMerchantIdByWallet(address wallet) external view returns (uint256) {
        return walletToMerchantId[wallet];
    }

    function getMerchantWallets(uint256 merchantId) external view returns (address[] memory) {
        require(merchantId > 0 && merchantId <= merchantCounter, "Merchant does not exist");
        return merchantWallets[merchantId];
    }

    function getMerchantPolicy(uint256 merchantId) external view returns (MerchantPolicy memory) {
        require(merchantId > 0 && merchantId <= merchantCounter, "Merchant does not exist");
        return merchantPolicies[merchantId];
    }

    function getMerchantPolicyByWallet(address wallet) external view returns (MerchantPolicy memory) {
        uint256 mid = walletToMerchantId[wallet];
        if (mid == 0) return merchantPolicies[0];
        return merchantPolicies[mid];
    }

    function isWalletLinked(address wallet) external view returns (bool) {
        return walletToMerchantId[wallet] != 0;
    }

    function merchantExists(uint256 merchantId) external view returns (bool) {
        return merchantId > 0 && merchantId <= merchantCounter;
    }

    function totalMerchants() external view returns (uint256) {
        return merchantCounter;
    }
}
