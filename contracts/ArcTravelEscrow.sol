// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ArcTravelEscrow v4
 * @notice Travel Agency Scheduled Booking Payments for ArcPay on Arc Testnet.
 *
 * This is NOT lending, NOT BNPL, NOT consumer credit.
 * ArcPay does not advance funds. Merchant receives funds only when customer pays.
 * No admin. No fees. No upgradeability. No ETH. USDC only.
 *
 * v4 changes vs v3:
 * - Added: closedBlock, trancheRequestedBlock, tranchePaidBlock to TravelBooking struct
 *   for reliable on-chain TX hash recovery.
 *
 * v3 changes vs v2:
 * - Added: description field to TravelBooking struct
 */
interface IArcTravelERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract ArcTravelEscrow {

    IArcTravelERC20 public immutable usdc;

    constructor() {
        usdc = IArcTravelERC20(0x3600000000000000000000000000000000000000);
    }

    enum TravelStatus {
        Active,
        TranchePaid,
        CancelledBeforeDeadline,
        CancelledForMissedPayment,
        ReleasedToMerchant
    }

    struct TravelBooking {
        uint256      travelId;
        address      customer;
        address      merchant;
        uint256      totalPackageAmount;
        uint256      initialPaymentAmount;
        uint256      nonRefundableAmount;
        uint256      refundableEscrowAmount;
        uint256      nonRefundableBps;
        uint256      trancheAmount;
        uint256      paymentDueDate;
        uint256      paymentDeadline;
        uint256      cancellationDeadline;
        uint256      travelStartDate;
        string       travelRef;
        string       description;
        bytes32      metadataHash;
        bool         trancheRequested;
        bool         tranchePaid;
        uint256      tranchePaidAt;
        TravelStatus status;
        uint256      createdAt;
        uint256      closedAt;
        uint256      createdBlock;
        uint256      closedBlock;             // NEW v4
        uint256      trancheRequestedBlock;   // NEW v4
        uint256      tranchePaidBlock;        // NEW v4
    }

    struct CreateBookingParams {
        address merchant;
        uint256 totalPackageAmount;
        uint256 initialPaymentAmount;
        uint256 nonRefundableBps;
        uint256 trancheAmount;
        uint256 paymentDueDate;
        uint256 paymentDeadline;
        uint256 cancellationDeadline;
        uint256 travelStartDate;
        string  travelRef;
        string  description;
        bytes32 metadataHash;
    }

    uint256 public travelCounter;

    mapping(uint256 => TravelBooking) private travelBookings;
    mapping(address => uint256[])     private customerTravelBookings;
    mapping(address => uint256[])     private merchantTravelBookings;

    event TravelBookingCreated(
        uint256 indexed travelId,
        address indexed customer,
        address indexed merchant,
        uint256 totalPackageAmount,
        uint256 initialPaymentAmount,
        uint256 nonRefundableAmount,
        uint256 refundableEscrowAmount,
        uint256 trancheAmount,
        uint256 timestamp
    );

    event TravelBookingCreatedDates(
        uint256 indexed travelId,
        uint256 paymentDueDate,
        uint256 paymentDeadline,
        uint256 cancellationDeadline,
        uint256 travelStartDate,
        string  travelRef,
        string  description,
        bytes32 metadataHash
    );

    event TranchePaymentRequested(
        uint256 indexed travelId,
        address indexed merchant,
        uint256 trancheAmount,
        uint256 paymentDueDate,
        uint256 paymentDeadline,
        uint256 timestamp
    );

    event TranchePaymentPaid(
        uint256 indexed travelId,
        address indexed customer,
        uint256 trancheAmount,
        uint256 timestamp
    );

    event TravelBookingCancelledBeforeDeadline(
        uint256 indexed travelId,
        address indexed cancelledBy,
        address indexed customer,
        uint256 refundedAmount,
        uint256 timestamp
    );

    event TravelBookingCancelledForMissedPayment(
        uint256 indexed travelId,
        address indexed merchant,
        uint256 releasedAmount,
        uint256 timestamp
    );

    event TravelBookingReleasedToMerchant(
        uint256 indexed travelId,
        address indexed merchant,
        uint256 releasedAmount,
        uint256 timestamp
    );

    function createTravelBooking(
        address merchant,
        uint256 totalPackageAmount,
        uint256 initialPaymentAmount,
        uint256 nonRefundableBps,
        uint256 trancheAmount,
        uint256 paymentDueDate,
        uint256 paymentDeadline,
        uint256 cancellationDeadline,
        uint256 travelStartDate,
        string  calldata travelRef,
        string  calldata description,
        bytes32 metadataHash
    ) external returns (uint256) {
        CreateBookingParams memory p = CreateBookingParams({
            merchant:             merchant,
            totalPackageAmount:   totalPackageAmount,
            initialPaymentAmount: initialPaymentAmount,
            nonRefundableBps:     nonRefundableBps,
            trancheAmount:        trancheAmount,
            paymentDueDate:       paymentDueDate,
            paymentDeadline:      paymentDeadline,
            cancellationDeadline: cancellationDeadline,
            travelStartDate:      travelStartDate,
            travelRef:            travelRef,
            description:          description,
            metadataHash:         metadataHash
        });
        return _createBooking(p);
    }

    function _createBooking(CreateBookingParams memory p) internal returns (uint256 travelId) {
        require(p.merchant != address(0),                                          "Invalid merchant address");
        require(p.merchant != msg.sender,                                          "Merchant cannot be customer");
        require(p.totalPackageAmount > 0,                                          "Total package amount required");
        require(p.initialPaymentAmount > 0,                                        "Initial payment required");
        require(p.initialPaymentAmount <= p.totalPackageAmount,                    "Initial exceeds total");
        require(p.trancheAmount > 0,                                               "Tranche amount required");
        require(p.initialPaymentAmount + p.trancheAmount <= p.totalPackageAmount,  "Payments exceed total");
        require(p.nonRefundableBps <= 10000,                                       "Invalid non-refundable bps");
        require(bytes(p.description).length <= 256,                                "Description too long");
        require(bytes(p.travelRef).length > 0,                                     "Travel ref required");
        require(bytes(p.travelRef).length <= 64,                                   "Travel ref too long");

        require(p.paymentDueDate > block.timestamp,                                "Payment due date must be future");
        require(p.paymentDeadline > p.paymentDueDate,                             "Payment deadline must be after due date");
        require(p.cancellationDeadline > p.paymentDeadline,                       "Cancellation deadline must be after payment deadline");
        require(p.travelStartDate > p.cancellationDeadline,                       "Travel start must be after cancellation deadline");

        require(usdc.allowance(msg.sender, address(this)) >= p.initialPaymentAmount, "Insufficient USDC allowance");
        require(usdc.balanceOf(msg.sender) >= p.initialPaymentAmount,              "Insufficient USDC balance");

        uint256 nonRefundableAmount    = (p.initialPaymentAmount * p.nonRefundableBps) / 10000;
        uint256 refundableEscrowAmount = p.initialPaymentAmount - nonRefundableAmount;

        if (nonRefundableAmount > 0) {
            require(usdc.transferFrom(msg.sender, p.merchant, nonRefundableAmount), "Non-refundable transfer failed");
        }
        if (refundableEscrowAmount > 0) {
            require(usdc.transferFrom(msg.sender, address(this), refundableEscrowAmount), "Escrow transfer failed");
        }

        travelCounter++;
        travelId = travelCounter;

        _storeBooking(travelId, p, nonRefundableAmount, refundableEscrowAmount);

        customerTravelBookings[msg.sender].push(travelId);
        merchantTravelBookings[p.merchant].push(travelId);

        emit TravelBookingCreated(
            travelId, msg.sender, p.merchant,
            p.totalPackageAmount, p.initialPaymentAmount,
            nonRefundableAmount, refundableEscrowAmount,
            p.trancheAmount, block.timestamp
        );

        emit TravelBookingCreatedDates(
            travelId,
            p.paymentDueDate, p.paymentDeadline,
            p.cancellationDeadline, p.travelStartDate,
            p.travelRef, p.description, p.metadataHash
        );
    }

    function _storeBooking(
        uint256 travelId,
        CreateBookingParams memory p,
        uint256 nonRefundableAmount,
        uint256 refundableEscrowAmount
    ) internal {
        travelBookings[travelId] = TravelBooking({
            travelId:               travelId,
            customer:               msg.sender,
            merchant:               p.merchant,
            totalPackageAmount:     p.totalPackageAmount,
            initialPaymentAmount:   p.initialPaymentAmount,
            nonRefundableAmount:    nonRefundableAmount,
            refundableEscrowAmount: refundableEscrowAmount,
            nonRefundableBps:       p.nonRefundableBps,
            trancheAmount:          p.trancheAmount,
            paymentDueDate:         p.paymentDueDate,
            paymentDeadline:        p.paymentDeadline,
            cancellationDeadline:   p.cancellationDeadline,
            travelStartDate:        p.travelStartDate,
            travelRef:              p.travelRef,
            description:            p.description,
            metadataHash:           p.metadataHash,
            trancheRequested:       false,
            tranchePaid:            false,
            tranchePaidAt:          0,
            status:                 TravelStatus.Active,
            createdAt:              block.timestamp,
            closedAt:               0,
            createdBlock:           block.number,
            closedBlock:            0,
            trancheRequestedBlock:  0,
            tranchePaidBlock:       0
        });
    }

    function requestTranchePayment(uint256 travelId) external {
        TravelBooking storage t = travelBookings[travelId];
        require(t.travelId != 0,                      "Travel booking does not exist");
        require(msg.sender == t.merchant,             "Not merchant");
        require(t.status == TravelStatus.Active,      "Booking not active");
        require(block.timestamp >= t.paymentDueDate,  "Payment not due yet");
        require(block.timestamp < t.paymentDeadline,  "Payment deadline passed");
        require(!t.trancheRequested,                  "Already requested");

        t.trancheRequested      = true;
        t.trancheRequestedBlock = block.number;

        emit TranchePaymentRequested(
            travelId, msg.sender, t.trancheAmount,
            t.paymentDueDate, t.paymentDeadline, block.timestamp
        );
    }

    function payTranche(uint256 travelId) external {
        TravelBooking storage t = travelBookings[travelId];
        require(t.travelId != 0,                      "Travel booking does not exist");
        require(msg.sender == t.customer,             "Not customer");
        require(t.status == TravelStatus.Active,      "Booking not active");
        require(block.timestamp <= t.paymentDeadline, "Payment deadline passed");
        require(!t.tranchePaid,                       "Tranche already paid");
        require(usdc.allowance(msg.sender, address(this)) >= t.trancheAmount, "Insufficient allowance");
        require(usdc.balanceOf(msg.sender) >= t.trancheAmount, "Insufficient balance");

        require(usdc.transferFrom(msg.sender, t.merchant, t.trancheAmount), "Tranche transfer failed");

        t.tranchePaid      = true;
        t.tranchePaidAt    = block.timestamp;
        t.tranchePaidBlock = block.number;
        t.status           = TravelStatus.TranchePaid;

        emit TranchePaymentPaid(travelId, msg.sender, t.trancheAmount, block.timestamp);
    }

    function cancelBeforeDeadline(uint256 travelId) external {
        TravelBooking storage t = travelBookings[travelId];
        require(t.travelId != 0,                                      "Travel booking does not exist");
        require(msg.sender == t.customer || msg.sender == t.merchant, "Not customer or merchant");
        require(
            t.status == TravelStatus.Active || t.status == TravelStatus.TranchePaid,
            "Cannot cancel in current status"
        );
        require(block.timestamp < t.cancellationDeadline, "Cancellation deadline passed");

        t.status      = TravelStatus.CancelledBeforeDeadline;
        t.closedAt    = block.timestamp;
        t.closedBlock = block.number;

        uint256 refund = t.refundableEscrowAmount;
        if (refund > 0) {
            require(usdc.transfer(t.customer, refund), "Refund transfer failed");
        }

        emit TravelBookingCancelledBeforeDeadline(
            travelId, msg.sender, t.customer, refund, block.timestamp
        );
    }

    function cancelForMissedPayment(uint256 travelId) external {
        TravelBooking storage t = travelBookings[travelId];
        require(t.travelId != 0,                     "Travel booking does not exist");
        require(msg.sender == t.merchant,            "Not merchant");
        require(t.status == TravelStatus.Active,     "Booking not active");
        require(!t.tranchePaid,                      "Tranche already paid");
        require(block.timestamp > t.paymentDeadline, "Payment deadline not passed");

        t.status      = TravelStatus.CancelledForMissedPayment;
        t.closedAt    = block.timestamp;
        t.closedBlock = block.number;

        uint256 released = t.refundableEscrowAmount;
        if (released > 0) {
            require(usdc.transfer(t.merchant, released), "Release transfer failed");
        }

        emit TravelBookingCancelledForMissedPayment(
            travelId, msg.sender, released, block.timestamp
        );
    }

    function releaseAfterCancellationDeadline(uint256 travelId) external {
        TravelBooking storage t = travelBookings[travelId];
        require(t.travelId != 0,                     "Travel booking does not exist");
        require(msg.sender == t.merchant,            "Not merchant");
        require(
            t.status == TravelStatus.Active || t.status == TravelStatus.TranchePaid,
            "Cannot release in current status"
        );
        require(block.timestamp >= t.cancellationDeadline, "Cancellation deadline not passed");

        t.status      = TravelStatus.ReleasedToMerchant;
        t.closedAt    = block.timestamp;
        t.closedBlock = block.number;

        uint256 released = t.refundableEscrowAmount;
        if (released > 0) {
            require(usdc.transfer(t.merchant, released), "Release transfer failed");
        }

        emit TravelBookingReleasedToMerchant(
            travelId, t.merchant, released, block.timestamp
        );
    }

    function getTravelBooking(uint256 travelId) external view returns (TravelBooking memory) {
        require(travelBookings[travelId].travelId != 0, "Travel booking does not exist");
        return travelBookings[travelId];
    }

    function getCustomerTravelBookings(address customer) external view returns (uint256[] memory) {
        return customerTravelBookings[customer];
    }

    function getMerchantTravelBookings(address merchant) external view returns (uint256[] memory) {
        return merchantTravelBookings[merchant];
    }

    function travelBookingExists(uint256 travelId) external view returns (bool) {
        return travelBookings[travelId].travelId != 0;
    }

    function totalTravelBookings() external view returns (uint256) {
        return travelCounter;
    }
}
