// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GlobalPayPaymentManager {
    enum PaymentType { DIRECT, SCHEDULED, ESCROW, INVOICE, REQUEST }
    enum PaymentStatus { PENDING, HELD, RELEASED, CANCELLED }

    struct Payment {
        PaymentType pType;
        PaymentStatus status;
        address sender;
        address receiver;
        uint256 amount;
        uint256 releaseTime;
        bytes32 invoiceRef;
        bool exists;
    }

    mapping(bytes32 => Payment) public payments;
    address public owner;

    event PaymentCreated(bytes32 indexed id, PaymentType indexed pType, address indexed sender, address receiver, uint256 amount, uint256 releaseTime);
    event PaymentReleased(bytes32 indexed id);
    event PaymentCancelled(bytes32 indexed id, uint256 refundAmount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _create(bytes32 id, PaymentType pType, address receiver, uint256 releaseTime, bytes32 invoiceRef) internal {
        require(!payments[id].exists, "ID exists");
        require(receiver != address(0), "Zero receiver");
        require(msg.value > 0, "Zero value");
        if (pType == PaymentType.SCHEDULED) {
            require(releaseTime > block.timestamp, "Past release");
        }
        payments[id] = Payment({
            pType: pType,
            status: PaymentStatus.HELD,
            sender: msg.sender,
            receiver: receiver,
            amount: msg.value,
            releaseTime: releaseTime,
            invoiceRef: invoiceRef,
            exists: true
        });
        emit PaymentCreated(id, pType, msg.sender, receiver, msg.value, releaseTime);
    }

    function createDirect(bytes32 id, address receiver) external payable {
        _create(id, PaymentType.DIRECT, receiver, 0, bytes32(0));
    }

    function createScheduled(bytes32 id, address receiver, uint256 releaseTime) external payable {
        _create(id, PaymentType.SCHEDULED, receiver, releaseTime, bytes32(0));
    }

    function createEscrow(bytes32 id, address receiver) external payable {
        _create(id, PaymentType.ESCROW, receiver, 0, bytes32(0));
    }

    function settleInvoice(bytes32 id, address receiver, bytes32 invoiceRef) external payable {
        _create(id, PaymentType.INVOICE, receiver, 0, invoiceRef);
    }

    function settleRequest(bytes32 id, address receiver) external payable {
        _create(id, PaymentType.REQUEST, receiver, 0, bytes32(0));
    }

    function release(bytes32 id) external {
        Payment storage p = payments[id];
        require(p.exists, "Not found");
        require(p.status == PaymentStatus.HELD, "Not held");
        if (p.pType == PaymentType.SCHEDULED) {
            require(block.timestamp >= p.releaseTime, "Too early");
        }
        p.status = PaymentStatus.RELEASED;
        (bool sent, ) = payable(p.receiver).call{value: p.amount}("");
        require(sent, "Release failed");
        emit PaymentReleased(id);
    }

    function cancel(bytes32 id) external {
        Payment storage p = payments[id];
        require(p.exists, "Not found");
        require(p.status == PaymentStatus.HELD, "Not held");
        require(p.pType != PaymentType.INVOICE && p.pType != PaymentType.REQUEST, "Cannot cancel");
        require(msg.sender == p.sender, "Not sender");
        p.status = PaymentStatus.CANCELLED;
        (bool sent, ) = payable(p.sender).call{value: p.amount}("");
        require(sent, "Refund failed");
        emit PaymentCancelled(id, p.amount);
    }

    function getPayment(bytes32 id) external view returns (PaymentType, PaymentStatus, address, address, uint256, uint256, bytes32) {
        Payment memory p = payments[id];
        require(p.exists, "Not found");
        return (p.pType, p.status, p.sender, p.receiver, p.amount, p.releaseTime, p.invoiceRef);
    }
}
