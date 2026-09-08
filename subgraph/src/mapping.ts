import {
  PaymentCreated,
  PaymentReleased,
  PaymentCancelled,
} from '../generated/GlobalPayPaymentManager/GlobalPayPaymentManager';
import { GlobalPayPaymentManager } from '../generated/GlobalPayPaymentManager/GlobalPayPaymentManager';
import { InvoiceReference, Payment, Settlement } from '../generated/schema';
import { Bytes, BigInt } from '@graphprotocol/graph-ts';

const HELD = 'HELD';
const RELEASED = 'RELEASED';
const CANCELLED = 'CANCELLED';

function paymentFor(id: Bytes): Payment | null {
  return Payment.load(id);
}

function setStatus(id: Bytes, status: string, eventBlock: BigInt, eventTimestamp: BigInt, txHash: Bytes): void {
  const payment = paymentFor(id);
  if (payment == null) return;

  payment.status = status;
  payment.save();

  const settlement = Settlement.load(id);
  if (settlement == null) return;
  settlement.status = status;
  settlement.transactionHash = txHash;
  settlement.blockNumber = eventBlock;
  settlement.timestamp = eventTimestamp;
  if (status == RELEASED) settlement.settledAt = eventTimestamp;
  settlement.save();
}

export function handlePaymentCreated(event: PaymentCreated): void {
  const id = event.params.id;
  const payment = new Payment(id);
  payment.transactionHash = event.transaction.hash;
  payment.blockNumber = event.block.number;
  payment.timestamp = event.block.timestamp;
  payment.payer = event.params.sender;
  payment.payee = event.params.receiver;
  payment.amount = event.params.amount;
  payment.paymentType = event.params.pType;
  payment.status = HELD;
  payment.releaseTime = event.params.releaseTime;

  const settlement = new Settlement(id);
  settlement.payment = id;
  settlement.transactionHash = event.transaction.hash;
  settlement.blockNumber = event.block.number;
  settlement.timestamp = event.block.timestamp;
  settlement.payer = event.params.sender;
  settlement.payee = event.params.receiver;
  settlement.amount = event.params.amount;
  settlement.status = HELD;
  settlement.save();
  payment.settlement = id;

  const manager = GlobalPayPaymentManager.bind(event.address);
  const paymentState = manager.try_getPayment(id);
  if (!paymentState.reverted) {
    const invoiceRef = paymentState.value.value6;
    if (invoiceRef.notEqual(Bytes.empty())) {
      // Invoice references are immutable and may be reused by more than one
      // on-chain event. Insert the first occurrence only; never overwrite it.
      let invoice = InvoiceReference.load(invoiceRef);
      if (invoice == null) {
        invoice = new InvoiceReference(invoiceRef);
        invoice.payment = id;
        invoice.reference = invoiceRef;
        invoice.transactionHash = event.transaction.hash;
        invoice.blockNumber = event.block.number;
        invoice.timestamp = event.block.timestamp;
        invoice.save();
      }
      payment.invoiceReference = invoiceRef;
    }
  }

  payment.save();
}

export function handlePaymentReleased(event: PaymentReleased): void {
  setStatus(event.params.id, RELEASED, event.block.number, event.block.timestamp, event.transaction.hash);
}

export function handlePaymentCancelled(event: PaymentCancelled): void {
  setStatus(event.params.id, CANCELLED, event.block.number, event.block.timestamp, event.transaction.hash);
}
