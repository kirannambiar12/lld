// ── Enums ────────────────────────────────────────────────

const PaymentMethod = Object.freeze({
    CARD: "CARD",
    UPI: "UPI",
    NET_BANKING: "NET_BANKING",
    WALLET: "WALLET",
});

const PaymentState = Object.freeze({
    CREATED: "CREATED",
    REQUIRES_ACTION: "REQUIRES_ACTION",
    AUTHORIZED: "AUTHORIZED",
    CAPTURED: "CAPTURED",
    SETTLED: "SETTLED",
    FAILED: "FAILED",
    REFUND_PENDING: "REFUND_PENDING",
    REFUNDED: "REFUNDED",
});

const RefundState = Object.freeze({
    PENDING: "PENDING",
    SUCCEEDED: "SUCCEEDED",
    FAILED: "FAILED",
});

// ── Core Entities ────────────────────────────────────────

class PaymentIntent {
    constructor({
        intentId,
        orderId,
        merchantId,
        amountMinor,
        currency,
        paymentMethod,
        gateway,
        idempotencyKey,
    }) {
        this.intentId = intentId;
        this.orderId = orderId;
        this.merchantId = merchantId;
        this.amountMinor = amountMinor;
        this.currency = currency;
        this.paymentMethod = paymentMethod;
        this.gateway = gateway;
        this.idempotencyKey = idempotencyKey;
        this.state = PaymentState.CREATED;
        this.failureCode = null;
        this.failureMessage = null;
        this.version = 0;
    }
}

class PaymentTransaction {
    constructor({ txnId, intentId, gatewayPaymentId }) {
        this.txnId = txnId;
        this.intentId = intentId;
        this.gatewayPaymentId = gatewayPaymentId;
        this.authorizedAmount = 0;
        this.capturedAmount = 0;
        this.status = PaymentState.CREATED;
    }
}

class Refund {
    constructor({ refundId, txnId, amountMinor, reason, idempotencyKey }) {
        this.refundId = refundId;
        this.txnId = txnId;
        this.amountMinor = amountMinor;
        this.reason = reason;
        this.idempotencyKey = idempotencyKey;
        this.gatewayRefundId = null;
        this.state = RefundState.PENDING;
    }
}

class WebhookEvent {
    constructor({ gateway, gatewayEventId, eventType, payload }) {
        this.gateway = gateway;
        this.gatewayEventId = gatewayEventId;
        this.eventType = eventType;
        this.payload = payload;
        this.status = "RECEIVED";
        this.receivedAt = new Date();
        this.processedAt = null;
    }
}

// ── Gateway Adapter ──────────────────────────────────────

class MockGatewayAdapter {
    constructor(name) {
        this.name = name;
    }

    createPaymentSession(intent) {
        return {
            gatewayPaymentId: `${this.name.toLowerCase()}_pay_${Date.now()}`,
            redirectUrl: `https://${this.name.toLowerCase()}.example/checkout/${intent.intentId}`,
            status: PaymentState.REQUIRES_ACTION,
        };
    }

    capturePayment(txn, amountMinor) {
        return {
            success: true,
            capturedAmount: amountMinor,
            status: PaymentState.CAPTURED,
            gatewayPaymentId: txn.gatewayPaymentId,
        };
    }

    refundPayment(txn, amountMinor) {
        return {
            success: true,
            gatewayRefundId: `rf_${txn.txnId}_${Date.now()}`,
            amountMinor,
            status: RefundState.SUCCEEDED,
        };
    }
}

// ── In-Memory Repositories ───────────────────────────────

class PaymentIntentRepository {
    constructor() {
        this.byId = new Map();
        this.byIdempotency = new Map();
    }

    save(intent) {
        this.byId.set(intent.intentId, intent);
        this.byIdempotency.set(
            `${intent.merchantId}:${intent.idempotencyKey}`,
            intent.intentId
        );
    }

    findById(intentId) {
        return this.byId.get(intentId) || null;
    }

    findByIdempotency(merchantId, idempotencyKey) {
        const intentId = this.byIdempotency.get(`${merchantId}:${idempotencyKey}`);
        return intentId ? this.byId.get(intentId) : null;
    }
}

class PaymentTransactionRepository {
    constructor() {
        this.byId = new Map();
        this.byGatewayPaymentId = new Map();
    }

    save(txn) {
        this.byId.set(txn.txnId, txn);
        this.byGatewayPaymentId.set(txn.gatewayPaymentId, txn.txnId);
    }

    findById(txnId) {
        return this.byId.get(txnId) || null;
    }

    findByGatewayPaymentId(gatewayPaymentId) {
        const txnId = this.byGatewayPaymentId.get(gatewayPaymentId);
        return txnId ? this.byId.get(txnId) : null;
    }
}

class RefundRepository {
    constructor() {
        this.byId = new Map();
    }

    save(refund) {
        this.byId.set(refund.refundId, refund);
    }

    findById(refundId) {
        return this.byId.get(refundId) || null;
    }
}

module.exports = {
    PaymentMethod,
    PaymentState,
    RefundState,
    PaymentIntent,
    PaymentTransaction,
    Refund,
    WebhookEvent,
    MockGatewayAdapter,
    PaymentIntentRepository,
    PaymentTransactionRepository,
    RefundRepository,
};
