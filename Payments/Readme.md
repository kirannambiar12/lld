Design a payments system that:

- Supports multiple payment methods: Card, UPI, NetBanking, Wallet
- Handles full lifecycle: Create Order -> Authorize -> Capture -> Settle -> Refund
- Integrates with multiple gateways using a common adapter interface
- Uses async workflows for webhook handling, retries, reconciliation, and settlement
- Ensures idempotency and exactly-once business effects (at-least-once delivery safe)
- Persists auditable transaction history and supports dispute/chargeback handling

---

## 1) Scope

### In Scope
- Order and payment intent creation
- Payment authorization and capture
- Webhook ingestion and state transitions
- Refunds (full and partial)
- Settlement ingestion and reconciliation jobs
- Ledger entries for accounting traceability
- Basic risk checks and idempotency

### Out of Scope (for this LLD)
- PCI vault implementation details
- Advanced fraud ML model internals
- Multi-currency FX optimization
- Complex split settlements across hundreds of sub-merchants

---

## 2) Functional Requirements

1. User can initiate payment for an order.
2. System should support multiple gateways and route based on rules.
3. Payment status must be queryable in near real-time.
4. Same request retried by client should not create duplicate charge.
5. Webhook events must be authenticated, deduplicated, and processed safely.
6. Merchant can trigger refund (full/partial) with reason.
7. Daily reconciliation should detect mismatches and raise alerts.
8. Every state change must be auditable.

## 3) Non-Functional Requirements

- Availability: 99.95% for payment initiation APIs
- P99 latency: < 300ms for create intent (excluding gateway user interaction)
- Durability: no loss of financial events
- Consistency: strong consistency per payment aggregate
- Security: signed webhooks, encrypted PII/token references, RBAC for ops APIs
- Scalability: horizontal scale for API + consumers + webhook processors

---

## 4) High-Level Architecture

### Core Services
- **Payment API Service**
  - Exposes REST APIs for payment intents, status, refunds
  - Validates input, idempotency keys, authn/authz
- **Payment Orchestrator**
  - Drives payment state machine
  - Coordinates gateway adapter calls and event publishing
- **Gateway Adapter Layer**
  - Common interface for Stripe/Razorpay/Adyen/etc.
  - Isolates provider-specific request/response formats
- **Webhook Service**
  - Validates signatures, stores raw event, publishes internal event
- **Reconciliation Worker**
  - Compares internal records vs gateway settlement files/APIs
- **Ledger Service**
  - Creates immutable debit/credit entries for money movement
- **Notification Service**
  - Sends payment success/failure/refund notifications

### Infra Components
- Primary DB (PostgreSQL)
- Message Broker (Kafka/SQS/RabbitMQ)
- Redis (idempotency cache + short-lived locks)
- Object storage for settlement files

---

## 5) Domain Model (LLD)

### Entities
- `Order`
  - `order_id`, `merchant_id`, `amount`, `currency`, `status`
- `PaymentIntent`
  - Represents one payment attempt for an order
  - `intent_id`, `order_id`, `amount`, `state`, `idempotency_key`, `gateway`
- `PaymentTransaction`
  - Gateway-level transaction info
  - `txn_id`, `intent_id`, `gateway_payment_id`, `authorized_amount`, `captured_amount`
- `Refund`
  - `refund_id`, `txn_id`, `amount`, `state`, `reason`
- `WebhookEvent`
  - `event_id`, `gateway`, `event_type`, `payload_hash`, `processed_at`
- `LedgerEntry`
  - `entry_id`, `account_id`, `direction`, `amount`, `currency`, `reference_type`, `reference_id`

### Payment State Machine

`CREATED -> REQUIRES_ACTION -> AUTHORIZED -> CAPTURED -> SETTLED`

Failure paths:
- `CREATED -> FAILED`
- `AUTHORIZED -> VOIDED`
- `CAPTURED -> REFUND_PENDING -> REFUNDED` (full or partial)
- Any active state -> `DISPUTED`

State transitions are performed only by orchestrator commands or validated webhooks.

---

## 6) API Design (Representative)

### Create Payment Intent
`POST /v1/payments/intents`

Request
```json
{
  "orderId": "ord_123",
  "amount": 120000,
  "currency": "INR",
  "paymentMethod": "CARD",
  "idempotencyKey": "f6f2f3c5-2d52-4d14-b55d-5f6d0c850001"
}
```

Response
```json
{
  "intentId": "pi_789",
  "status": "REQUIRES_ACTION",
  "redirectUrl": "https://gateway.example/checkout/..."
}
```

### Get Payment Status
`GET /v1/payments/intents/{intentId}`

### Capture Payment (manual capture mode)
`POST /v1/payments/intents/{intentId}/capture`

### Create Refund
`POST /v1/payments/refunds`
```json
{
  "transactionId": "txn_555",
  "amount": 50000,
  "reason": "CUSTOMER_REQUEST",
  "idempotencyKey": "96257b6f-cfe8-4f65-a8ea-6d4aef8f2009"
}
```

### Webhook Endpoint
`POST /v1/payments/webhooks/{gateway}`

---

## 7) Workflow Design

## 7.1 Payment Success Flow (Card + Redirect)
1. Client calls Create Intent with idempotency key.
2. Payment API checks idempotency store:
   - If key exists, return previous response.
   - Else create new `PaymentIntent` (`CREATED`).
3. Orchestrator selects gateway via routing rules.
4. Gateway adapter creates gateway payment session.
5. Intent moves to `REQUIRES_ACTION`; redirect URL returned to client.
6. User completes payment on gateway page.
7. Gateway sends webhook: `payment.authorized` / `payment.captured`.
8. Webhook service verifies signature, persists event, enqueues internal event.
9. Consumer updates transaction + intent state (`AUTHORIZED`/`CAPTURED`).
10. Ledger entries are written.
11. Outbox publishes `PaymentCaptured` event.
12. Order service marks order as paid.

## 7.2 Payment Failure Flow
1. Gateway sends failure webhook or timeout occurs.
2. Processor marks intent `FAILED` with failure reason/code.
3. Outbox publishes `PaymentFailed`.
4. Notification service informs user/merchant.

## 7.3 Refund Flow (Async)
1. Merchant calls refund API with idempotency key.
2. System validates refundable balance.
3. Creates `Refund` in `PENDING`, enqueues `ProcessRefund`.
4. Worker calls gateway refund API.
5. On success webhook/poll update: `Refund -> SUCCEEDED`.
6. Ledger reversal entries created.
7. Publish `RefundSucceeded`.

## 7.4 Reconciliation Flow (Daily)
1. Scheduler triggers reconciliation job per gateway + date window.
2. Worker fetches settlement file/API records.
3. Match by `gateway_payment_id`, amount, status.
4. Classify results:
   - Matched
   - Missing internally
   - Missing on gateway
   - Amount/status mismatch
5. Persist reconciliation report and create incidents for mismatches.

---

## 8) Async Operations and Reliability

### Message Topics / Queues
- `payment.webhook.received`
- `payment.state.transitioned`
- `payment.refund.requested`
- `payment.reconciliation.requested`
- `payment.reconciliation.completed`

### Idempotency Strategy
- API idempotency key scope: `(merchant_id, endpoint, idempotency_key)`
- Webhook dedupe key: `(gateway, gateway_event_id)` unique constraint
- Consumer dedupe with processed-event table and upsert semantics

### Delivery Semantics
- Broker delivery is at-least-once
- Business effects are exactly-once using:
  - unique constraints
  - transactional outbox
  - deterministic state transition checks

### Retry Policy
- Exponential backoff with jitter (e.g., 1s, 5s, 30s, 2m, 10m)
- Dead-letter queue after max attempts
- Alert for poison messages

### Concurrency Controls
- Optimistic lock (`version` column) on `payment_intent`
- Optional distributed short lock for same `intent_id` transitions

---

## 9) DB Schema (PostgreSQL)

```sql
CREATE TABLE payment_intent (
  intent_id            VARCHAR(40) PRIMARY KEY,
  order_id             VARCHAR(40) NOT NULL,
  merchant_id          VARCHAR(40) NOT NULL,
  amount_minor         BIGINT NOT NULL,
  currency             CHAR(3) NOT NULL,
  payment_method       VARCHAR(20) NOT NULL,
  gateway              VARCHAR(20) NOT NULL,
  state                VARCHAR(30) NOT NULL,
  idempotency_key      VARCHAR(80) NOT NULL,
  version              BIGINT NOT NULL DEFAULT 0,
  failure_code         VARCHAR(50),
  failure_message      TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX idx_payment_intent_order ON payment_intent(order_id);
CREATE INDEX idx_payment_intent_state ON payment_intent(state);

CREATE TABLE payment_transaction (
  txn_id               VARCHAR(40) PRIMARY KEY,
  intent_id            VARCHAR(40) NOT NULL REFERENCES payment_intent(intent_id),
  gateway_payment_id   VARCHAR(80) NOT NULL,
  authorized_amount    BIGINT NOT NULL DEFAULT 0,
  captured_amount      BIGINT NOT NULL DEFAULT 0,
  status               VARCHAR(30) NOT NULL,
  auth_code            VARCHAR(40),
  gateway_raw          JSONB,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (gateway_payment_id)
);

CREATE TABLE refund (
  refund_id            VARCHAR(40) PRIMARY KEY,
  txn_id               VARCHAR(40) NOT NULL REFERENCES payment_transaction(txn_id),
  amount_minor         BIGINT NOT NULL,
  status               VARCHAR(30) NOT NULL,
  reason               VARCHAR(50),
  idempotency_key      VARCHAR(80) NOT NULL,
  gateway_refund_id    VARCHAR(80),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (txn_id, idempotency_key),
  UNIQUE (gateway_refund_id)
);

CREATE TABLE webhook_event (
  id                   BIGSERIAL PRIMARY KEY,
  gateway              VARCHAR(20) NOT NULL,
  gateway_event_id     VARCHAR(80) NOT NULL,
  event_type           VARCHAR(50) NOT NULL,
  payload              JSONB NOT NULL,
  payload_hash         VARCHAR(128) NOT NULL,
  received_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at         TIMESTAMP,
  status               VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
  UNIQUE (gateway, gateway_event_id)
);

CREATE TABLE ledger_entry (
  entry_id             BIGSERIAL PRIMARY KEY,
  account_id           VARCHAR(40) NOT NULL,
  direction            VARCHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount_minor         BIGINT NOT NULL,
  currency             CHAR(3) NOT NULL,
  reference_type       VARCHAR(20) NOT NULL,
  reference_id         VARCHAR(40) NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE outbox_event (
  id                   BIGSERIAL PRIMARY KEY,
  aggregate_type       VARCHAR(30) NOT NULL,
  aggregate_id         VARCHAR(40) NOT NULL,
  event_type           VARCHAR(50) NOT NULL,
  payload              JSONB NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  published_at         TIMESTAMP
);

CREATE INDEX idx_outbox_unpublished ON outbox_event(published_at) WHERE published_at IS NULL;
```

---

## 10) Gateway Adapter Interface (Example)

```java
public interface PaymentGatewayAdapter {
  CreateSessionResponse createPaymentSession(CreateSessionRequest request);
  AuthorizeResponse authorize(AuthorizeRequest request);
  CaptureResponse capture(CaptureRequest request);
  RefundResponse refund(RefundRequest request);
  VerifyWebhookResponse verifyWebhook(String signature, String payload);
  FetchPaymentResponse fetchPayment(String gatewayPaymentId);
}
```

`GatewayRouter` chooses adapter based on merchant config, success rates, cost, and failover rules.

---

## 11) Security and Compliance

- Never store raw card PAN/CVV in system DB.
- Store tokenized payment method references only.
- Encrypt sensitive fields at rest (KMS-managed keys).
- Verify webhook signatures and timestamp tolerance.
- HMAC signing for internal callback communication.
- Immutable audit log for admin and state-transition actions.

---

## 12) Observability and Operations

### Metrics
- `payment_intent_created_total`
- `payment_success_rate` by gateway/method
- `webhook_lag_seconds`
- `refund_success_rate`
- `reconciliation_mismatch_total`

### Logs and Tracing
- Correlation ID per request and propagated to events
- Structured logs with `intent_id`, `txn_id`, `gateway_event_id`
- Distributed tracing across API -> orchestrator -> queue -> worker

### Alerts
- Success rate drop below threshold
- DLQ growth
- Reconciliation mismatches above baseline
- Webhook signature failures spike

---

## 13) Trade-offs and Extensions

- Eventual consistency between order status and payment state is acceptable with fast convergence.
- Manual capture gives control but increases complexity.
- Future extensions:
  - Smart routing with adaptive gateway scoring
  - UPI collect + intent flows
  - Chargeback case management
  - Multi-ledger/accounting integration

---

## 14) Interview Discussion Points

- Why idempotency is mandatory in payments APIs
- Why webhook processing must be async and deduplicated
- How outbox + retries prevent event loss
- How reconciliation protects against silent failures
- Where to enforce invariants (state machine + DB constraints)
