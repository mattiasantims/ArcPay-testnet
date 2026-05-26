// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ─────────────────────────────────────────────────────────────────────────────
//  ArcBookingEscrow.sol  v3
//  Adds `closedBlock` to Booking struct for reliable TX hash recovery.
//
//  TESTNET ONLY — Arc Testnet (Chain ID: 5042002)
//  USDC ERC20:  0x3600000000000000000000000000000000000000
// ─────────────────────────────────────────────────────────────────────────────

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract ArcBookingEscrow {

    address public constant USDC = 0x3600000000000000000000000000000000000000;
    uint256 public constant BPS_DENOMINATOR = 10000;

    enum BookingStatus { Active, CancelledBeforeDeadline, ReleasedToMerchant }

    struct Booking {
        uint256 bookingId;
        address guest;
        address merchant;
        uint256 totalAmount;
        uint256 nonRefundableAmount;
        uint256 refundableAmount;
        uint256 nonRefundableBps;
        uint256 cancellationDeadline;
        uint256 checkInDate;
        string  bookingRef;
        string  description;
        bytes32 metadataHash;
        BookingStatus status;
        uint256 createdAt;
        uint256 closedAt;
        uint256 createdBlock;
        uint256 closedBlock;   // NEW v3: block number of cancel/release
    }

    uint256 public bookingCounter;
    mapping(uint256 => Booking)     private bookings;
    mapping(address => uint256[])   private guestBookings;
    mapping(address => uint256[])   private merchantBookings;

    bool private _locked;
    modifier nonReentrant() {
        require(!_locked, "ArcBookingEscrow: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    event BookingCreated(
        uint256 indexed bookingId,
        address indexed guest,
        address indexed merchant,
        uint256 totalAmount,
        uint256 nonRefundableAmount,
        uint256 refundableAmount,
        uint256 cancellationDeadline,
        uint256 checkInDate,
        string  bookingRef,
        string  description,
        bytes32 metadataHash,
        uint256 timestamp
    );

    event BookingCancelledBeforeDeadline(
        uint256 indexed bookingId,
        address indexed cancelledBy,
        address indexed guest,
        uint256 refundedAmount,
        uint256 timestamp
    );

    event BookingReleasedToMerchant(
        uint256 indexed bookingId,
        address indexed merchant,
        uint256 releasedAmount,
        uint256 timestamp
    );

    function createBookingPayment(
        address merchant,
        uint256 totalAmount,
        uint256 nonRefundableBps,
        uint256 cancellationDeadline,
        uint256 checkInDate,
        string  calldata bookingRef,
        string  calldata description,
        bytes32 metadataHash
    ) external nonReentrant returns (uint256 bookingId) {

        require(merchant != address(0),                     "ArcBookingEscrow: invalid merchant");
        require(merchant != msg.sender,                     "ArcBookingEscrow: guest and merchant must differ");
        require(totalAmount > 0,                            "ArcBookingEscrow: amount must be > 0");
        require(nonRefundableBps <= BPS_DENOMINATOR,        "ArcBookingEscrow: invalid non-refundable bps");
        require(cancellationDeadline > block.timestamp,     "ArcBookingEscrow: deadline must be in future");
        require(checkInDate > cancellationDeadline,         "ArcBookingEscrow: check-in must be after deadline");
        require(bytes(bookingRef).length > 0,               "ArcBookingEscrow: bookingRef required");
        require(bytes(bookingRef).length <= 64,             "ArcBookingEscrow: bookingRef too long");
        require(bytes(description).length <= 256,           "ArcBookingEscrow: description too long");
        require(
            IERC20(USDC).allowance(msg.sender, address(this)) >= totalAmount,
            "ArcBookingEscrow: insufficient USDC allowance"
        );
        require(
            IERC20(USDC).balanceOf(msg.sender) >= totalAmount,
            "ArcBookingEscrow: insufficient USDC balance"
        );

        uint256 nonRefundableAmount = (totalAmount * nonRefundableBps) / BPS_DENOMINATOR;
        uint256 refundableAmount    = totalAmount - nonRefundableAmount;

        if (nonRefundableAmount > 0) {
            bool ok1 = IERC20(USDC).transferFrom(msg.sender, merchant, nonRefundableAmount);
            require(ok1, "ArcBookingEscrow: non-refundable transfer failed");
        }
        if (refundableAmount > 0) {
            bool ok2 = IERC20(USDC).transferFrom(msg.sender, address(this), refundableAmount);
            require(ok2, "ArcBookingEscrow: escrow transfer failed");
        }

        bookingId = ++bookingCounter;
        bookings[bookingId] = Booking({
            bookingId:            bookingId,
            guest:                msg.sender,
            merchant:             merchant,
            totalAmount:          totalAmount,
            nonRefundableAmount:  nonRefundableAmount,
            refundableAmount:     refundableAmount,
            nonRefundableBps:     nonRefundableBps,
            cancellationDeadline: cancellationDeadline,
            checkInDate:          checkInDate,
            bookingRef:           bookingRef,
            description:          description,
            metadataHash:         metadataHash,
            status:               BookingStatus.Active,
            createdAt:            block.timestamp,
            closedAt:             0,
            createdBlock:         block.number,
            closedBlock:          0
        });

        guestBookings[msg.sender].push(bookingId);
        merchantBookings[merchant].push(bookingId);

        emit BookingCreated(
            bookingId, msg.sender, merchant,
            totalAmount, nonRefundableAmount, refundableAmount,
            cancellationDeadline, checkInDate, bookingRef, description, metadataHash,
            block.timestamp
        );
        return bookingId;
    }

    function cancelBeforeDeadline(uint256 bookingId) external nonReentrant {
        require(bookingExists(bookingId),                           "ArcBookingEscrow: booking not found");
        Booking storage b = bookings[bookingId];
        require(b.status == BookingStatus.Active,                   "ArcBookingEscrow: booking not active");
        require(block.timestamp < b.cancellationDeadline,           "ArcBookingEscrow: cancellation deadline passed");
        require(msg.sender == b.guest || msg.sender == b.merchant,  "ArcBookingEscrow: not guest or merchant");

        b.status      = BookingStatus.CancelledBeforeDeadline;
        b.closedAt    = block.timestamp;
        b.closedBlock = block.number;

        if (b.refundableAmount > 0) {
            bool ok = IERC20(USDC).transfer(b.guest, b.refundableAmount);
            require(ok, "ArcBookingEscrow: refund transfer failed");
        }
        emit BookingCancelledBeforeDeadline(
            bookingId, msg.sender, b.guest, b.refundableAmount, block.timestamp
        );
    }

    function releaseAfterDeadline(uint256 bookingId) external nonReentrant {
        require(bookingExists(bookingId),                   "ArcBookingEscrow: booking not found");
        Booking storage b = bookings[bookingId];
        require(b.status == BookingStatus.Active,           "ArcBookingEscrow: booking not active");
        require(block.timestamp >= b.cancellationDeadline,  "ArcBookingEscrow: deadline not reached yet");
        require(msg.sender == b.merchant,                   "ArcBookingEscrow: only merchant can release");

        b.status      = BookingStatus.ReleasedToMerchant;
        b.closedAt    = block.timestamp;
        b.closedBlock = block.number;

        if (b.refundableAmount > 0) {
            bool ok = IERC20(USDC).transfer(b.merchant, b.refundableAmount);
            require(ok, "ArcBookingEscrow: release transfer failed");
        }
        emit BookingReleasedToMerchant(
            bookingId, b.merchant, b.refundableAmount, block.timestamp
        );
    }

    function getBooking(uint256 bookingId) external view returns (Booking memory) {
        require(bookingExists(bookingId), "ArcBookingEscrow: booking not found");
        return bookings[bookingId];
    }
    function getGuestBookings(address guest) external view returns (uint256[] memory) {
        return guestBookings[guest];
    }
    function getMerchantBookings(address merchant) external view returns (uint256[] memory) {
        return merchantBookings[merchant];
    }
    function bookingExists(uint256 bookingId) public view returns (bool) {
        return bookingId > 0 && bookingId <= bookingCounter;
    }
    function totalBookings() external view returns (uint256) {
        return bookingCounter;
    }
}
