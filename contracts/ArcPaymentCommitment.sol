// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// solc-flags: --via-ir --optimize --optimize-runs 200

interface IArcPayERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

abstract contract ArcPayReentrancyGuard {
    uint256 private _status = 1;
    modifier nonReentrant() {
        require(_status != 2, "ReentrancyGuard: reentrant call");
        _status = 2;
        _;
        _status = 1;
    }
}

/**
 * @title ArcPaymentCommitment v2
 * @notice Delayed payment and tranche payment commitments for online/luxury ArcPay flows.
 *
 * No escrow. No lending. No credit. No funds are advanced by ArcPay.
 * Customer funds move only when the customer fulfils a delayed payment or a tranche.
 * The merchant can cancel an overdue active commitment.
 *
 * v2 changes vs v1:
 * - Added: createdBlock, closedBlock to Commitment struct
 * - Added: tranchePaidBlocks[] array to record block.number of each tranche payment
 * - Enables reliable on-chain TX hash recovery via scanBlock pattern
 */
contract ArcPaymentCommitment is ArcPayReentrancyGuard {

    enum CommitmentStatus { Active, Fulfilled, Cancelled, Expired }
    enum CommitmentType   { Delayed, Tranche }

    struct Commitment {
        address merchant;
        address customer;
        uint256 totalAmount;
        string  ref;
        string  description;
        bytes32 metadataHash;
        CommitmentType   commitmentType;
        CommitmentStatus status;
        uint256 createdAt;
        // Delayed payment fields
        uint256 dueDate;
        uint256 deadline;
        bool    paid;
        // Tranche fields
        uint256[] trancheAmounts;
        uint256[] trancheDueDates;
        uint256[] trancheDeadlines;
        bool[]    tranchePaid;
        uint256   tranchesPaidCount;
        // ── v2 block tracking for TX hash recovery ──
        uint256   createdBlock;          // block.number at creation
        uint256   closedBlock;           // block.number at fulfill (delayed) / cancel / expire
        uint256[] tranchePaidBlocks;     // block.number for each paid tranche, 0 if not yet paid
    }

    uint256 public constant MAX_TRANCHES = 12;
    uint256 public constant MAX_REF_LENGTH = 96;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 240;

    IArcPayERC20 public immutable usdc;
    uint256 private _nextId = 1;

    mapping(uint256 => Commitment) private _commitments;
    mapping(address => uint256[])  private _merchantCommitments;
    mapping(address => uint256[])  private _customerCommitments;

    event CommitmentCreated(
        uint256 indexed commitmentId,
        CommitmentType commitmentType,
        address indexed customer,
        address indexed merchant,
        uint256 totalAmount,
        string ref
    );

    event CommitmentFulfilled(
        uint256 indexed commitmentId,
        address indexed customer,
        address indexed merchant,
        uint256 amount,
        string ref
    );

    event TrancheFulfilled(
        uint256 indexed commitmentId,
        uint256 indexed trancheIndex,
        address indexed customer,
        address merchant,
        uint256 amount,
        string ref
    );

    event CommitmentCancelled(uint256 indexed commitmentId, address indexed cancelledBy, string ref);
    event CommitmentExpired(uint256 indexed commitmentId, string ref);

    constructor(address _usdc) {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = IArcPayERC20(_usdc);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    function _safeTransferFrom(address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = address(usdc).call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "USDC transferFrom failed");
    }

    function _validateCommon(address merchant, string calldata ref, string calldata description) internal view {
        require(merchant != address(0), "Invalid merchant");
        require(merchant != msg.sender, "Merchant cannot be customer");
        require(bytes(ref).length > 0, "Ref required");
        require(bytes(ref).length <= MAX_REF_LENGTH, "Ref too long");
        require(bytes(description).length <= MAX_DESCRIPTION_LENGTH, "Description too long");
    }

    // ── Delayed Payment ──────────────────────────────────────────────────────

    function createDelayedCommitment(
        address merchant,
        uint256 amount,
        uint256 dueDate,
        uint256 deadline,
        string calldata ref,
        string calldata description,
        bytes32 metadataHash
    ) external returns (uint256 commitmentId) {
        _validateCommon(merchant, ref, description);
        require(amount > 0, "Amount must be > 0");
        require(dueDate > block.timestamp, "Due date must be in the future");
        require(deadline >= dueDate, "Deadline must be >= due date");

        commitmentId = _nextId++;

        Commitment storage c = _commitments[commitmentId];
        c.merchant       = merchant;
        c.customer       = msg.sender;
        c.totalAmount    = amount;
        c.ref            = ref;
        c.description    = description;
        c.metadataHash   = metadataHash;
        c.commitmentType = CommitmentType.Delayed;
        c.status         = CommitmentStatus.Active;
        c.createdAt      = block.timestamp;
        c.createdBlock   = block.number;
        c.dueDate        = dueDate;
        c.deadline       = deadline;
        c.paid           = false;

        _merchantCommitments[merchant].push(commitmentId);
        _customerCommitments[msg.sender].push(commitmentId);

        emit CommitmentCreated(commitmentId, CommitmentType.Delayed, msg.sender, merchant, amount, ref);
    }

    function fulfillDelayedCommitment(uint256 commitmentId) external nonReentrant {
        Commitment storage c = _commitments[commitmentId];
        require(c.customer != address(0), "Commitment not found");
        require(msg.sender == c.customer, "Only customer can fulfil");
        require(c.commitmentType == CommitmentType.Delayed, "Not delayed");
        require(c.status == CommitmentStatus.Active, "Not active");
        require(!c.paid, "Already paid");

        c.paid        = true;
        c.status      = CommitmentStatus.Fulfilled;
        c.closedBlock = block.number;

        _safeTransferFrom(msg.sender, c.merchant, c.totalAmount);

        emit CommitmentFulfilled(commitmentId, msg.sender, c.merchant, c.totalAmount, c.ref);
    }

    // ── Tranche Payment ──────────────────────────────────────────────────────

    function createTrancheCommitment(
        address merchant,
        uint256[] calldata trancheAmounts,
        uint256[] calldata trancheDueDates,
        uint256[] calldata trancheDeadlines,
        string calldata ref,
        string calldata description,
        bytes32 metadataHash
    ) external returns (uint256 commitmentId) {
        _validateCommon(merchant, ref, description);
        require(trancheAmounts.length > 0, "At least 1 tranche required");
        require(trancheAmounts.length <= MAX_TRANCHES, "Too many tranches");
        require(trancheAmounts.length == trancheDueDates.length, "Array length mismatch");
        require(trancheAmounts.length == trancheDeadlines.length, "Array length mismatch");

        uint256 total = 0;
        for (uint256 i = 0; i < trancheAmounts.length; i++) {
            require(trancheAmounts[i] > 0, "Each tranche must be > 0");
            require(trancheDueDates[i] > block.timestamp, "Due date must be in the future");
            require(trancheDeadlines[i] >= trancheDueDates[i], "Deadline must be >= due date");
            if (i > 0) {
                require(trancheDueDates[i] > trancheDueDates[i - 1], "Due dates must be ascending");
            }
            total += trancheAmounts[i];
        }

        commitmentId = _nextId++;

        Commitment storage c = _commitments[commitmentId];
        c.merchant         = merchant;
        c.customer         = msg.sender;
        c.totalAmount      = total;
        c.ref              = ref;
        c.description      = description;
        c.metadataHash     = metadataHash;
        c.commitmentType   = CommitmentType.Tranche;
        c.status           = CommitmentStatus.Active;
        c.createdAt        = block.timestamp;
        c.createdBlock     = block.number;
        c.trancheAmounts   = trancheAmounts;
        c.trancheDueDates  = trancheDueDates;
        c.trancheDeadlines = trancheDeadlines;
        c.tranchesPaidCount = 0;

        bool[]    memory paid       = new bool[](trancheAmounts.length);
        uint256[] memory paidBlocks = new uint256[](trancheAmounts.length);
        c.tranchePaid       = paid;
        c.tranchePaidBlocks = paidBlocks;

        _merchantCommitments[merchant].push(commitmentId);
        _customerCommitments[msg.sender].push(commitmentId);

        emit CommitmentCreated(commitmentId, CommitmentType.Tranche, msg.sender, merchant, total, ref);
    }

    function fulfillTranche(uint256 commitmentId, uint256 trancheIndex) external nonReentrant {
        Commitment storage c = _commitments[commitmentId];
        require(c.customer != address(0), "Commitment not found");
        require(msg.sender == c.customer, "Only customer can fulfil");
        require(c.commitmentType == CommitmentType.Tranche, "Not tranche");
        require(c.status == CommitmentStatus.Active, "Not active");
        require(trancheIndex < c.trancheAmounts.length, "Invalid tranche index");
        require(!c.tranchePaid[trancheIndex], "Tranche already paid");
        require(trancheIndex == c.tranchesPaidCount, "Must pay tranches in order");

        uint256 amount = c.trancheAmounts[trancheIndex];
        c.tranchePaid[trancheIndex]       = true;
        c.tranchePaidBlocks[trancheIndex] = block.number;
        c.tranchesPaidCount++;

        if (c.tranchesPaidCount == c.trancheAmounts.length) {
            c.status      = CommitmentStatus.Fulfilled;
            c.closedBlock = block.number;
        }

        _safeTransferFrom(msg.sender, c.merchant, amount);

        emit TrancheFulfilled(commitmentId, trancheIndex, msg.sender, c.merchant, amount, c.ref);

        if (c.status == CommitmentStatus.Fulfilled) {
            emit CommitmentFulfilled(commitmentId, msg.sender, c.merchant, c.totalAmount, c.ref);
        }
    }

    // ── Cancellation / expiry ────────────────────────────────────────────────

    function cancelCommitment(uint256 commitmentId) public {
        Commitment storage c = _commitments[commitmentId];
        require(c.merchant != address(0), "Commitment not found");
        require(msg.sender == c.merchant, "Only merchant can cancel");
        require(c.status == CommitmentStatus.Active, "Not active");

        if (c.commitmentType == CommitmentType.Delayed) {
            require(block.timestamp > c.deadline, "Deadline not yet passed");
        } else {
            uint256 nextIdx = c.tranchesPaidCount;
            require(nextIdx < c.trancheAmounts.length, "All tranches paid");
            require(block.timestamp > c.trancheDeadlines[nextIdx], "Tranche deadline not yet passed");
        }

        c.status      = CommitmentStatus.Cancelled;
        c.closedBlock = block.number;
        emit CommitmentCancelled(commitmentId, msg.sender, c.ref);
    }

    function cancelTrancheCommitment(uint256 commitmentId) external {
        Commitment storage c = _commitments[commitmentId];
        require(c.commitmentType == CommitmentType.Tranche, "Not tranche");
        cancelCommitment(commitmentId);
    }

    function expireCommitment(uint256 commitmentId) external {
        Commitment storage c = _commitments[commitmentId];
        require(c.merchant != address(0), "Commitment not found");
        require(c.status == CommitmentStatus.Active, "Not active");

        if (c.commitmentType == CommitmentType.Delayed) {
            require(block.timestamp > c.deadline, "Deadline not yet passed");
        } else {
            uint256 nextIdx = c.tranchesPaidCount;
            require(nextIdx < c.trancheAmounts.length, "All tranches paid");
            require(block.timestamp > c.trancheDeadlines[nextIdx], "Tranche deadline not yet passed");
        }

        c.status      = CommitmentStatus.Expired;
        c.closedBlock = block.number;
        emit CommitmentExpired(commitmentId, c.ref);
    }

    // ── View functions ───────────────────────────────────────────────────────

    function getCommitment(uint256 commitmentId) external view returns (Commitment memory) {
        require(_commitments[commitmentId].customer != address(0), "Not found");
        return _commitments[commitmentId];
    }

    function getMerchantCommitments(address merchant) external view returns (uint256[] memory) {
        return _merchantCommitments[merchant];
    }

    function getCustomerCommitments(address customer) external view returns (uint256[] memory) {
        return _customerCommitments[customer];
    }

    function totalCommitments() external view returns (uint256) {
        return _nextId - 1;
    }
}
