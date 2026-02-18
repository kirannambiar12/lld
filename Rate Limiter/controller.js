const {
    Strategy,
    Rule,
    TokenBucket,
    SlidingWindow,
    FixedWindow,
} = require("./classes");

// ── Rate Limiter (Main System) ───────────────────────────
// Manages per-user rate limiting using a chosen strategy.
//
//   const limiter = new RateLimiter(Strategy.TOKEN_BUCKET, new Rule(5, 60000));
//   limiter.handleRequest("user-1")  → true/false

class RateLimiter {
    constructor(strategy, rule) {
        this.strategy = strategy;
        this.rule = rule;
        this.clients = new Map(); // userId → bucket/window instance
    }

    // Get or create a limiter instance for a given user
    getClientLimiter(userId) {
        if (!this.clients.has(userId)) {
            let limiter;

            switch (this.strategy) {
                case Strategy.TOKEN_BUCKET:
                    limiter = new TokenBucket(
                        this.rule.maxRequests,
                        this.rule.windowMs
                    );
                    break;

                case Strategy.SLIDING_WINDOW:
                    limiter = new SlidingWindow(
                        this.rule.maxRequests,
                        this.rule.windowMs
                    );
                    break;

                case Strategy.FIXED_WINDOW:
                    limiter = new FixedWindow(
                        this.rule.maxRequests,
                        this.rule.windowMs
                    );
                    break;

                default:
                    throw new Error(`Unknown strategy: ${this.strategy}`);
            }

            this.clients.set(userId, limiter);
        }

        return this.clients.get(userId);
    }

    handleRequest(userId) {
        const limiter = this.getClientLimiter(userId);
        const allowed = limiter.allowRequest();

        if (allowed) {
            console.log(`✅ [${userId}] Request allowed`);
        } else {
            console.log(`🚫 [${userId}] Rate limited`);
        }

        return allowed;
    }
}

// ── Example Usage ────────────────────────────────────────

// Rule: 3 requests per 5 seconds
const rule = new Rule(3, 5000);

// --- Token Bucket ---
console.log("=== Token Bucket ===\n");
const tokenLimiter = new RateLimiter(Strategy.TOKEN_BUCKET, rule);

tokenLimiter.handleRequest("user-1"); // ✅ allowed
tokenLimiter.handleRequest("user-1"); // ✅ allowed
tokenLimiter.handleRequest("user-1"); // ✅ allowed
tokenLimiter.handleRequest("user-1"); // 🚫 rate limited
tokenLimiter.handleRequest("user-2"); // ✅ allowed (different user, own bucket)

// --- Sliding Window ---
console.log("\n=== Sliding Window ===\n");
const slidingLimiter = new RateLimiter(Strategy.SLIDING_WINDOW, rule);

slidingLimiter.handleRequest("user-1"); // ✅
slidingLimiter.handleRequest("user-1"); // ✅
slidingLimiter.handleRequest("user-1"); // ✅
slidingLimiter.handleRequest("user-1"); // 🚫

// --- Fixed Window ---
console.log("\n=== Fixed Window ===\n");
const fixedLimiter = new RateLimiter(Strategy.FIXED_WINDOW, rule);

fixedLimiter.handleRequest("user-1"); // ✅
fixedLimiter.handleRequest("user-1"); // ✅
fixedLimiter.handleRequest("user-1"); // ✅
fixedLimiter.handleRequest("user-1"); // 🚫

module.exports = { RateLimiter };
