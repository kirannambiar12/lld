Design a rate limiter system that:

- Supports multiple strategies: Token Bucket, Sliding Window, Fixed Window

- Can rate-limit per user/client (by userId or IP)

- Allows or rejects a request based on configured limits

- Configurable: maxRequests and time window per rule

- Can apply different rules to different users/routes
