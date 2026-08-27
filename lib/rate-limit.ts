// Best-effort in-memory rate limiter for the login endpoint.
//
// This is intentionally simple: it protects against casual brute-force
// attempts on a single warm serverless instance. It is NOT a durable or
// distributed rate limiter — on Vercel each cold-started instance starts
// with a fresh counter, and traffic can land on different instances. For a
// private single-operator app behind a strong password this tradeoff is
// acceptable; revisit with a shared store (e.g. a Supabase table or Upstash)
// if that ever changes.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil(
      (WINDOW_MS - (now - bucket.windowStart)) / 1000
    );
    return { allowed: false, retryAfterSeconds };
  }

  bucket.count += 1;
  return { allowed: true };
}
