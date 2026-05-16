// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ArcProof
/// @notice TESTNET ONLY — payment + business-readable proof primitive for ArcPay.
/// @dev This contract is the ArcProof receipt engine already deployed at
///      0x9A284a4af4476Dddb353793A79C1a8BfC09e8334 on Arc Testnet.
///      Standard ArcPay and Luxury Retail flows reuse that deployed contract.
///      Do not redeploy unless intentionally creating a new ArcProof instance.
interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract ArcProof {
    struct Proof {
        uint256 proofId;
        address payer;
        address payee;
        address token;
        uint256 amount;
        string paymentRef;
        string purposeCode;
        bytes32 metadataHash;
        uint256 timestamp;
        uint256 createdBlock;
    }

    uint256 private proofCounter;

    mapping(uint256 => Proof) private proofs;
    mapping(address => uint256[]) private proofsSent;
    mapping(address => uint256[]) private proofsReceived;

    event ProofCreated(
        uint256 indexed proofId,
        address indexed payer,
        address indexed payee,
        address token,
        uint256 amount,
        string paymentRef,
        string purposeCode,
        bytes32 metadataHash,
        uint256 timestamp,
        uint256 createdBlock
    );

    /// @notice Transfers ERC-20 funds and creates an on-chain payment proof in the same transaction.
    /// @dev The caller must approve this contract for at least `amount` before calling.
    function payAndCreateProof(
        address token,
        address payee,
        uint256 amount,
        string calldata paymentRef,
        string calldata purposeCode,
        bytes32 metadataHash
    ) external returns (uint256 proofId) {
        require(token != address(0), "Invalid token");
        require(payee != address(0), "Invalid payee");
        require(payee != msg.sender, "Cannot pay self");
        require(amount > 0, "Amount must be > 0");
        require(bytes(paymentRef).length <= 64, "Payment ref too long");
        require(bytes(purposeCode).length <= 32, "Purpose code too long");

        bool ok = IERC20(token).transferFrom(msg.sender, payee, amount);
        require(ok, "Token transfer failed");

        proofCounter += 1;
        proofId = proofCounter;

        proofs[proofId] = Proof({
            proofId: proofId,
            payer: msg.sender,
            payee: payee,
            token: token,
            amount: amount,
            paymentRef: paymentRef,
            purposeCode: purposeCode,
            metadataHash: metadataHash,
            timestamp: block.timestamp,
            createdBlock: block.number
        });

        proofsSent[msg.sender].push(proofId);
        proofsReceived[payee].push(proofId);

        emit ProofCreated(
            proofId,
            msg.sender,
            payee,
            token,
            amount,
            paymentRef,
            purposeCode,
            metadataHash,
            block.timestamp,
            block.number
        );
    }

    function getProof(uint256 proofId) external view returns (Proof memory) {
        require(proofExists(proofId), "Proof does not exist");
        return proofs[proofId];
    }

    function getProofsSent(address user) external view returns (uint256[] memory) {
        return proofsSent[user];
    }

    function getProofsReceived(address user) external view returns (uint256[] memory) {
        return proofsReceived[user];
    }

    function proofExists(uint256 proofId) public view returns (bool) {
        return proofId > 0 && proofId <= proofCounter && proofs[proofId].payer != address(0);
    }

    function totalProofs() external view returns (uint256) {
        return proofCounter;
    }
}
