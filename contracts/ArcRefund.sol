// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IArcRefundERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title ArcRefund v4
 * @notice Manages refund requests for ArcPay luxury payments (instant, delayed, tranche).
 *
 * v4 changes vs v3:
 *   - Added: requestedBlock, processedBlock to RefundRequest struct
 *   - Enables reliable on-chain TX hash recovery via scanBlock pattern
 */
contract ArcRefund {

    IArcRefundERC20 public immutable usdc;

    uint256 public constant MAX_REF_LENGTH    = 64;
    uint256 public constant MAX_REASON_LENGTH = 256;

    enum RefundStatus { Requested, Approved, Denied, Direct }

    struct RefundRequest {
        address      merchant;
        address      customer;
        uint256      amount;
        string       proofRef;
        string       reason;
        RefundStatus status;
        uint256      requestedAt;
        uint256      processedAt;
        // v4 block tracking
        uint256      requestedBlock;
        uint256      processedBlock;
    }

    uint256 private _nextId = 1;

    mapping(uint256 => RefundRequest) private _requests;
    mapping(address => uint256[]) private _merchantRefunds;
    mapping(address => uint256[]) private _customerRefunds;

    event RefundRequested(uint256 indexed refundId, address indexed customer, address indexed merchant, uint256 amount, string proofRef);
    event RefundApproved(uint256 indexed refundId, address indexed merchant, address indexed customer, uint256 amount, string proofRef);
    event RefundDenied(uint256 indexed refundId, address indexed merchant, string proofRef);
    event DirectRefund(uint256 indexed refundId, address indexed merchant, address indexed customer, uint256 amount, string proofRef, string reason);

    constructor(address _usdc) {
        usdc = IArcRefundERC20(_usdc);
    }

    function requestRefund(
        address merchant,
        uint256 amount,
        string calldata proofRef,
        string calldata reason
    ) external returns (uint256 refundId) {
        require(merchant != address(0),                             "Invalid merchant");
        require(amount > 0,                                         "Amount must be > 0");
        require(bytes(proofRef).length <= MAX_REF_LENGTH,           "proofRef too long");
        require(bytes(reason).length  <= MAX_REASON_LENGTH,         "reason too long");

        refundId = _nextId++;
        _requests[refundId] = RefundRequest({
            merchant:    merchant,
            customer:    msg.sender,
            amount:      amount,
            proofRef:    proofRef,
            reason:      reason,
            status:      RefundStatus.Requested,
            requestedAt: block.timestamp,
            processedAt: 0,
            requestedBlock: block.number,
            processedBlock: 0
        });
        _merchantRefunds[merchant].push(refundId);
        _customerRefunds[msg.sender].push(refundId);

        emit RefundRequested(refundId, msg.sender, merchant, amount, proofRef);
    }

    function approveRefund(uint256 refundId) external {
        RefundRequest storage r = _requests[refundId];
        require(r.merchant == msg.sender,           "Not the merchant");
        require(r.status == RefundStatus.Requested, "Not in Requested status");

        r.status         = RefundStatus.Approved;
        r.processedAt    = block.timestamp;
        r.processedBlock = block.number;

        require(usdc.transferFrom(msg.sender, r.customer, r.amount), "USDC transfer failed");
        emit RefundApproved(refundId, msg.sender, r.customer, r.amount, r.proofRef);
    }

    function denyRefund(uint256 refundId) external {
        RefundRequest storage r = _requests[refundId];
        require(r.merchant == msg.sender,           "Not the merchant");
        require(r.status == RefundStatus.Requested, "Not in Requested status");

        r.status         = RefundStatus.Denied;
        r.processedAt    = block.timestamp;
        r.processedBlock = block.number;

        emit RefundDenied(refundId, msg.sender, r.proofRef);
    }

    function directRefund(
        address customer,
        uint256 amount,
        string calldata proofRef,
        string calldata reason
    ) external returns (uint256 refundId) {
        require(customer != address(0),                             "Invalid customer");
        require(amount > 0,                                         "Amount must be > 0");
        require(bytes(proofRef).length <= MAX_REF_LENGTH,           "proofRef too long");
        require(bytes(reason).length  <= MAX_REASON_LENGTH,         "reason too long");

        refundId = _nextId++;
        _requests[refundId] = RefundRequest({
            merchant:    msg.sender,
            customer:    customer,
            amount:      amount,
            proofRef:    proofRef,
            reason:      reason,
            status:      RefundStatus.Direct,
            requestedAt: 0,
            processedAt: block.timestamp,
            requestedBlock: 0,
            processedBlock: block.number
        });
        _merchantRefunds[msg.sender].push(refundId);
        _customerRefunds[customer].push(refundId);

        require(usdc.transferFrom(msg.sender, customer, amount), "USDC transfer failed - approve contract first");
        emit DirectRefund(refundId, msg.sender, customer, amount, proofRef, reason);
    }

    function getRefundRequest(uint256 refundId) external view returns (RefundRequest memory) {
        return _requests[refundId];
    }
    function getMerchantRefunds(address merchant) external view returns (uint256[] memory) {
        return _merchantRefunds[merchant];
    }
    function getCustomerRefunds(address customer) external view returns (uint256[] memory) {
        return _customerRefunds[customer];
    }
    function totalRefunds() external view returns (uint256) {
        return _nextId - 1;
    }
}
