import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Lazily build a single sliding-window limiter so the Redis client is created
// once per server instance. Returns null when Upstash env vars are absent so
// callers can degrade gracefully (e.g. local dev without Redis configured).
let limiter: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (limiter) return limiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    // 5 submissions per 10 minutes per identifier (IP). Tune to taste.
    limiter: Ratelimit.slidingWindow(5, "10 m"),
    prefix: "contact",
    analytics: false,
  });
  return limiter;
}

export async function checkRateLimit(
  identifier: string
): Promise<{ success: boolean }> {
  const rl = getLimiter();
  // No limiter configured -> allow the request rather than blocking the form.
  // The form should never hard-fail just because Redis is unset in some env.
  if (!rl) return { success: true };

  const { success } = await rl.limit(identifier);
  return { success };
}
