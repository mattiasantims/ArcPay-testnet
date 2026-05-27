// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  ArcMerchantPayouts
 * @notice Single + batch USDC outbound payments for merchants on Arc Testnet.
 *         Includes an alias-only counterparty registry (no PII on-chain).
 *
 *         Testnet demo only. Payout labels, descriptions and references may
 *         be publicly visible on-chain. Do NOT include personal, payroll,
 *         tax or confidential information.
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract ArcMerchantPayouts {

    IERC20 public immutable usdc;

    // Limits to keep gas predictable on Arc Testnet
    uint256 public constant MAX_BATCH_SIZE      = 20;
    uint256 public constant MAX_ALIAS_LEN       = 32;
    uint256 public constant MAX_CATEGORY_LEN    = 24;
    uint256 public constant MAX_REF_LEN         = 64;
    uint256 public constant MAX_DESCRIPTION_LEN = 256;
    uint256 public constant MAX_PURPOSE_LEN     = 32;

    constructor(address usdcToken) {
        require(usdcToken != address(0), "usdc=0");
        usdc = IERC20(usdcToken);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Counterparty alias registry — NO PII
    // ──────────────────────────────────────────────────────────────────────
    struct Counterparty {
        address merchant;
        address wallet;
        string  aliasName;     // e.g. SUPPLIER-001, CONTRACTOR-002, TEAM-001
        string  category;      // Supplier / Contractor / Team / Other
        bytes32 metadataHash;  // off-chain doc fingerprint, NEVER store data
        bool    active;
        uint256 createdAt;
        uint256 updatedAt;
    }

    uint256 public counterpartyCounter;
    mapping(uint256 => Counterparty) private counterparties;
    mapping(address => uint256[])    private merchantCounterparties;

    event CounterpartyCreated(
        uint256 indexed counterpartyId,
        address indexed merchant,
        address indexed wallet,
        string  aliasName,
        string  category,
        bytes32 metadataHash,
        uint256 timestamp
    );

    event CounterpartyUpdated(
        uint256 indexed counterpartyId,
        address indexed merchant,
        address wallet,
        string  aliasName,
        string  category,
        bytes32 metadataHash,
        bool    active,
        uint256 timestamp
    );

    event CounterpartyDeactivated(
        uint256 indexed counterpartyId,
        address indexed merchant,
        uint256 timestamp
    );

    function createCounterparty(
        address wallet,
        string calldata aliasName,
        string calldata category,
        bytes32 metadataHash
    ) external returns (uint256 counterpartyId) {
        require(wallet != address(0),                                 "wallet=0");
        require(bytes(aliasName).length > 0,                          "alias required");
        require(bytes(aliasName).length <= MAX_ALIAS_LEN,             "alias too long");
        require(bytes(category).length > 0,                           "category required");
        require(bytes(category).length <= MAX_CATEGORY_LEN,           "category too long");

        counterpartyCounter += 1;
        counterpartyId = counterpartyCounter;

        counterparties[counterpartyId] = Counterparty({
            merchant:     msg.sender,
            wallet:       wallet,
            aliasName:    aliasName,
            category:     category,
            metadataHash: metadataHash,
            active:       true,
            createdAt:    block.timestamp,
            updatedAt:    block.timestamp
        });
        merchantCounterparties[msg.sender].push(counterpartyId);

        emit CounterpartyCreated(counterpartyId, msg.sender, wallet, aliasName, category, metadataHash, block.timestamp);
    }

    function updateCounterparty(
        uint256 counterpartyId,
        address wallet,
        string calldata aliasName,
        string calldata category,
        bytes32 metadataHash,
        bool    active
    ) external {
        Counterparty storage c = counterparties[counterpartyId];
        require(c.merchant == msg.sender,                              "not owner");
        require(wallet != address(0),                                  "wallet=0");
        require(bytes(aliasName).length > 0,                           "alias required");
        require(bytes(aliasName).length <= MAX_ALIAS_LEN,              "alias too long");
        require(bytes(category).length > 0,                            "category required");
        require(bytes(category).length <= MAX_CATEGORY_LEN,            "category too long");

        c.wallet       = wallet;
        c.aliasName    = aliasName;
        c.category     = category;
        c.metadataHash = metadataHash;
        c.active       = active;
        c.updatedAt    = block.timestamp;

        emit CounterpartyUpdated(counterpartyId, msg.sender, wallet, aliasName, category, metadataHash, active, block.timestamp);
    }

    function deactivateCounterparty(uint256 counterpartyId) external {
        Counterparty storage c = counterparties[counterpartyId];
        require(c.merchant == msg.sender, "not owner");
        c.active    = false;
        c.updatedAt = block.timestamp;
        emit CounterpartyDeactivated(counterpartyId, msg.sender, block.timestamp);
    }

    function getCounterparty(uint256 counterpartyId) external view returns (Counterparty memory) {
        require(counterparties[counterpartyId].merchant != address(0), "not found");
        return counterparties[counterpartyId];
    }

    function getMerchantCounterparties(address merchant) external view returns (uint256[] memory) {
        return merchantCounterparties[merchant];
    }

    function totalCounterparties() external view returns (uint256) {
        return counterpartyCounter;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Payouts — single + batch
    // ──────────────────────────────────────────────────────────────────────
    struct Payout {
        address merchant;
        address recipient;
        uint256 amount;
        string  paymentRef;
        string  description;
        string  purposeCode;
        bytes32 metadataHash;
        uint256 counterpartyId;     // 0 if not linked to alias
        bytes32 batchRefHash;       // keccak256(batchRef) for batch lookup; 0 for single
        uint256 createdAt;
        uint256 createdBlock;
    }

    uint256 public payoutCounter;
    mapping(uint256 => Payout) private payouts;
    mapping(address => uint256[]) private merchantPayouts;
    mapping(address => uint256[]) private recipientPayouts;
    mapping(bytes32 => uint256[]) private batchPayouts;  // batchRefHash -> payoutIds

    event PayoutExecuted(
        uint256 indexed payoutId,
        address indexed merchant,
        address indexed recipient,
        uint256 amount,
        string  paymentRef,
        string  description,
        string  purposeCode,
        bytes32 metadataHash,
        uint256 counterpartyId,
        bytes32 batchRefHash,
        uint256 timestamp
    );

    event BatchPayoutCreated(
        address indexed merchant,
        bytes32 indexed batchRefHash,
        string  batchRef,
        uint256 itemCount,
        uint256 totalAmount,
        uint256 timestamp
    );

    function createPayout(
        address recipient,
        uint256 amount,
        string calldata paymentRef,
        string calldata description,
        string calldata purposeCode,
        bytes32 metadataHash,
        uint256 counterpartyId
    ) external returns (uint256 payoutId) {
        payoutId = _executeSingle(
            recipient, amount,
            paymentRef, description, purposeCode,
            metadataHash, counterpartyId,
            bytes32(0)  // single payout, no batch
        );
    }

    function createBatchPayout(
        address[] calldata recipients,
        uint256[] calldata amounts,
        string   calldata batchRef,
        string[] calldata paymentRefs,
        string[] calldata descriptions,
        string   calldata purposeCode,
        bytes32  metadataHash,
        uint256[] calldata counterpartyIds
    ) external {
        uint256 n = recipients.length;
        require(n > 0,                                          "empty batch");
        require(n <= MAX_BATCH_SIZE,                            "batch too large");
        require(amounts.length         == n,                    "amounts mismatch");
        require(paymentRefs.length     == n,                    "refs mismatch");
        require(descriptions.length    == n,                    "descs mismatch");
        require(counterpartyIds.length == n,                    "cpIds mismatch");
        require(bytes(batchRef).length > 0,                     "batchRef required");
        require(bytes(batchRef).length <= MAX_REF_LEN,          "batchRef too long");

        bytes32 batchRefHash = keccak256(bytes(batchRef));
        require(batchPayouts[batchRefHash].length == 0,         "batchRef exists");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < n; i++) {
            totalAmount += amounts[i];
            _executeSingle(
                recipients[i], amounts[i],
                paymentRefs[i], descriptions[i], purposeCode,
                metadataHash, counterpartyIds[i],
                batchRefHash
            );
        }

        emit BatchPayoutCreated(msg.sender, batchRefHash, batchRef, n, totalAmount, block.timestamp);
    }

    function _executeSingle(
        address recipient,
        uint256 amount,
        string memory paymentRef,
        string memory description,
        string memory purposeCode,
        bytes32 metadataHash,
        uint256 counterpartyId,
        bytes32 batchRefHash
    ) internal returns (uint256 payoutId) {
        require(recipient != address(0),                              "recipient=0");
        require(recipient != msg.sender,                              "self payout");
        require(amount > 0,                                           "amount=0");
        require(bytes(paymentRef).length > 0,                         "paymentRef required");
        require(bytes(paymentRef).length <= MAX_REF_LEN,              "paymentRef too long");
        require(bytes(description).length > 0,                       "description required");
        require(bytes(description).length <= MAX_DESCRIPTION_LEN,    "description too long");
        require(bytes(purposeCode).length > 0,                        "purposeCode required");
        require(bytes(purposeCode).length <= MAX_PURPOSE_LEN,         "purposeCode too long");

        if (counterpartyId != 0) {
            Counterparty storage c = counterparties[counterpartyId];
            require(c.merchant == msg.sender, "cp not owner");
            require(c.active,                 "cp inactive");
            require(c.wallet == recipient,    "cp wallet mismatch");
        }

        // Pull USDC from merchant directly to recipient (no custody)
        require(usdc.allowance(msg.sender, address(this)) >= amount, "insufficient allowance");
        require(usdc.balanceOf(msg.sender) >= amount,                "insufficient balance");
        require(usdc.transferFrom(msg.sender, recipient, amount),    "transfer failed");

        payoutCounter += 1;
        payoutId = payoutCounter;

        payouts[payoutId] = Payout({
            merchant:       msg.sender,
            recipient:      recipient,
            amount:         amount,
            paymentRef:     paymentRef,
            description:    description,
            purposeCode:    purposeCode,
            metadataHash:   metadataHash,
            counterpartyId: counterpartyId,
            batchRefHash:   batchRefHash,
            createdAt:      block.timestamp,
            createdBlock:   block.number
        });
        merchantPayouts[msg.sender].push(payoutId);
        recipientPayouts[recipient].push(payoutId);
        if (batchRefHash != bytes32(0)) batchPayouts[batchRefHash].push(payoutId);

        emit PayoutExecuted(
            payoutId, msg.sender, recipient, amount,
            paymentRef, description, purposeCode,
            metadataHash, counterpartyId, batchRefHash, block.timestamp
        );
    }

    function getPayout(uint256 payoutId) external view returns (Payout memory) {
        require(payouts[payoutId].merchant != address(0), "not found");
        return payouts[payoutId];
    }

    function getMerchantPayouts(address merchant) external view returns (uint256[] memory) {
        return merchantPayouts[merchant];
    }

    function getRecipientPayouts(address recipient) external view returns (uint256[] memory) {
        return recipientPayouts[recipient];
    }

    function getBatchPayouts(bytes32 batchRefHash) external view returns (uint256[] memory) {
        return batchPayouts[batchRefHash];
    }

    function totalPayouts() external view returns (uint256) {
        return payoutCounter;
    }
}
