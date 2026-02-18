// ── Enums ────────────────────────────────────────────────

const Strategy = Object.freeze({
    TOKEN_BUCKET: "TOKEN_BUCKET",
    SLIDING_WINDOW: "SLIDING_WINDOW",
    FIXED_WINDOW: "FIXED_WINDOW",
});

// ── Rule ─────────────────────────────────────────────────
// Defines how many requests are allowed in a given time window.
//   new Rule(5, 60000)  → 5 requests per 60 seconds

class Rule {
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }
}

// ── Token Bucket ─────────────────────────────────────────
// Bucket starts full with `maxTokens` tokens.
// Each request consumes 1 token.
// Tokens refill at a steady rate: `maxTokens / windowMs` per ms.
//
//   bucket = new TokenBucket(5, 60000)
//   bucket.allowRequest()  → true  (4 tokens left)
//   ...5 calls later...
//   bucket.allowRequest()  → false (0 tokens, must wait for refill)

class TokenBucket {
    constructor(maxTokens, windowMs) {
        this.maxTokens = maxTokens;
        this.tokens = maxTokens;
        this.refillRate = maxTokens / windowMs; // tokens per ms
        this.lastRefillTime = Date.now();
    }

    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefillTime;
        const newTokens = elapsed * this.refillRate;

        this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
        this.lastRefillTime = now;
    }

    allowRequest() {
        this.refill();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }

        return false;
    }
}

// ── Sliding Window Log ───────────────────────────────────
// Keeps a log of all request timestamps.
// On each request, removes expired timestamps (older than windowMs),
// then checks if count < maxRequests.
//
//   window = new SlidingWindow(3, 10000)
//   window.allowRequest()  → true   (1 in log)
//   window.allowRequest()  → true   (2 in log)
//   window.allowRequest()  → true   (3 in log)
//   window.allowRequest()  → false  (3 already, limit hit)

class SlidingWindow {
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.timestamps = []; // sorted list of request times
    }

    allowRequest() {
        const now = Date.now();
        const windowStart = now - this.windowMs; //eg: current time - 5 seconds before = what time is it?

        // Remove expired timestamps
        this.timestamps = this.timestamps.filter((t) => t > windowStart);

        if (this.timestamps.length < this.maxRequests) {
            this.timestamps.push(now);
            return true;
        }

        return false;
    }
}

// ── Fixed Window Counter ─────────────────────────────────
// Divides time into fixed windows (e.g. every 60s).
// Counts requests in the current window.
// Resets counter when a new window starts.
//
//   counter = new FixedWindow(3, 10000)
//   counter.allowRequest()  → true  (window 1, count=1)
//   counter.allowRequest()  → true  (window 1, count=2)
//   counter.allowRequest()  → true  (window 1, count=3)
//   counter.allowRequest()  → false (window 1, limit hit)
//   ...10s later...
//   counter.allowRequest()  → true  (window 2, count=1, reset)

class FixedWindow {
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.count = 0;
        this.windowStart = Date.now();
    }

    allowRequest() {
        const now = Date.now();

        // If current window expired, start a new one
        if (now - this.windowStart >= this.windowMs) {
            this.windowStart = now;
            this.count = 0;
        }

        if (this.count < this.maxRequests) {
            this.count++;
            return true;
        }

        return false;
    }
}

// ── Exports ──────────────────────────────────────────────

module.exports = {
    Strategy,
    Rule,
    TokenBucket,
    SlidingWindow,
    FixedWindow,
};
