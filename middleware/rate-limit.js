// middleware/rate-limit.js
// Simple in-memory rate limiter

const rateBuckets = new Map(); // key -> { count, resetAt }

export const rateLimit = (max, windowMs) => (req, res, next) => {
  const now = Date.now();
  const key = `${req.ip}|${req.path}`;
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > max) {
    return res.status(429).json({ error: 'too_many_requests', error_description: 'Премногу обиди. Обидете се повторно подоцна.' });
  }
  if (rateBuckets.size > 10000) {
    for (const [k, v] of rateBuckets) {
      if (v.resetAt <= now) rateBuckets.delete(k);
    }
  }
  next();
};
