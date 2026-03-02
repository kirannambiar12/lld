const {
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
} = require("./classes");

// ── Payments System (Main Orchestrator) ──────────────────

class PaymentSystem {
    constructor() {
        this.intentRepo = new PaymentIntentRepository();
        this.txnRepo = new PaymentTransactionRepository();
        this.refundRepo = new RefundRepository();
        this.processedWebhooks = new Set();
        this.intentCounter = 0;
        this.txnCounter = 0;
        this.refundCounter = 0;
        this.gateway = new MockGatewayAdapter("RAZORPAY");
    }

    createPaymentIntent({
        orderId,
        merchantId,
        amountMinor,
        currency,
        paymentMethod,
        idempotencyKey,
    }) {
        const existingIntent = this.intentRepo.findByIdempotency(
            merchantId,
            idempotencyKey
        );
        if (existingIntent) {
            console.log("Idempotent replay detected, returning existing intent.");
            return existingIntent;
        }

        const intent = new PaymentIntent({
            intentId: `pi_${++this.intentCounter}`,
            orderId,
            merchantId,
            amountMinor,
            currency,
            paymentMethod,
            gateway: this.gateway.name,
            idempotencyKey,
        });

        const session = this.gateway.createPaymentSession(intent);
        intent.state = session.status;

        const txn = new PaymentTransaction({
            txnId: `txn_${++this.txnCounter}`,
            intentId: intent.intentId,
            gatewayPaymentId: session.gatewayPaymentId,
        });

        this.intentRepo.save(intent);
        this.txnRepo.save(txn);

        console.log(
            `Payment intent created. intentId=${intent.intentId}, redirectUrl=${session.redirectUrl}`
        );

        return intent;
    }

    handleWebhook({ gatewayEventId, eventType, gatewayPaymentId, amountMinor }) {
        if (this.processedWebhooks.has(gatewayEventId)) {
            console.log(`Duplicate webhook ignored: ${gatewayEventId}`);
            return;
        }

        const event = new WebhookEvent({
            gateway: this.gateway.name,
            gatewayEventId,
            eventType,
            payload: { gatewayPaymentId, amountMinor },
        });

        const txn = this.txnRepo.findByGatewayPaymentId(gatewayPaymentId);
        if (!txn) {
            throw new Error("Unknown gateway payment id");
        }

        const intent = this.intentRepo.findById(txn.intentId);
        if (!intent) {
            throw new Error("Payment intent not found");
        }

        if (eventType === "payment.authorized") {
            txn.authorizedAmount = amountMinor;
            txn.status = PaymentState.AUTHORIZED;
            intent.state = PaymentState.AUTHORIZED;
        } else if (eventType === "payment.captured") {
            txn.capturedAmount = amountMinor;
            txn.status = PaymentState.CAPTURED;
            intent.state = PaymentState.CAPTURED;
        } else if (eventType === "payment.failed") {
            txn.status = PaymentState.FAILED;
            intent.state = PaymentState.FAILED;
            intent.failureCode = "GATEWAY_FAILURE";
            intent.failureMessage = "Gateway reported payment failure";
        }

        this.txnRepo.save(txn);
        this.intentRepo.save(intent);
        this.processedWebhooks.add(gatewayEventId);
        event.status = "PROCESSED";
        event.processedAt = new Date();

        console.log(
            `Webhook processed. eventType=${eventType}, intentState=${intent.state}`
        );
    }

    capturePayment(intentId) {
        const intent = this.intentRepo.findById(intentId);
        if (!intent) {
            throw new Error("Intent not found");
        }

        if (intent.state !== PaymentState.AUTHORIZED) {
            throw new Error("Only AUTHORIZED intent can be captured");
        }

        const txn = [...this.txnRepo.byId.values()].find(
            (item) => item.intentId === intentId
        );

        const response = this.gateway.capturePayment(txn, intent.amountMinor);
        if (!response.success) {
            throw new Error("Capture failed");
        }

        txn.capturedAmount = response.capturedAmount;
        txn.status = PaymentState.CAPTURED;
        intent.state = PaymentState.CAPTURED;
        this.txnRepo.save(txn);
        this.intentRepo.save(intent);

        console.log(`Payment captured. intentId=${intentId}`);
    }

    createRefund({ txnId, amountMinor, reason, idempotencyKey }) {
        const txn = this.txnRepo.findById(txnId);
        if (!txn) {
            throw new Error("Transaction not found");
        }

        if (txn.capturedAmount < amountMinor) {
            throw new Error("Refund amount exceeds captured amount");
        }

        const refund = new Refund({
            refundId: `rf_${++this.refundCounter}`,
            txnId,
            amountMinor,
            reason,
            idempotencyKey,
        });

        const response = this.gateway.refundPayment(txn, amountMinor);
        refund.gatewayRefundId = response.gatewayRefundId;
        refund.state = response.success ? RefundState.SUCCEEDED : RefundState.FAILED;
        this.refundRepo.save(refund);

        const intent = this.intentRepo.findById(txn.intentId);
        intent.state =
            refund.state === RefundState.SUCCEEDED
                ? PaymentState.REFUNDED
                : PaymentState.REFUND_PENDING;
        this.intentRepo.save(intent);

        console.log(
            `Refund processed. refundId=${refund.refundId}, state=${refund.state}`
        );

        return refund;
    }
}

// ── Example Usage ────────────────────────────────────────

const system = new PaymentSystem();

const intent = system.createPaymentIntent({
    orderId: "ord_1001",
    merchantId: "m_1",
    amountMinor: 120000,
    currency: "INR",
    paymentMethod: PaymentMethod.CARD,
    idempotencyKey: "idem_001",
});

const createdTxn = [...system.txnRepo.byId.values()][0];

system.handleWebhook({
    gatewayEventId: "evt_auth_1",
    eventType: "payment.authorized",
    gatewayPaymentId: createdTxn.gatewayPaymentId,
    amountMinor: 120000,
});

system.handleWebhook({
    gatewayEventId: "evt_capture_1",
    eventType: "payment.captured",
    gatewayPaymentId: createdTxn.gatewayPaymentId,
    amountMinor: 120000,
});

const refund = system.createRefund({
    txnId: createdTxn.txnId,
    amountMinor: 20000,
    reason: "CUSTOMER_REQUEST",
    idempotencyKey: "refund_001",
});

console.log("Final Intent State:", system.intentRepo.findById(intent.intentId).state);
console.log("Refund State:", refund.state);

module.exports = { PaymentSystem };
