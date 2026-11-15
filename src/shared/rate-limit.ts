import { RequestHandler } from 'express';

// Giới hạn theo cửa sổ thời gian. Các tiến trình độc lập giữ bộ đếm riêng.
export function rateLimit(limit: number, windowMs: number, key: (req: Parameters<RequestHandler>[0]) => string): RequestHandler {
  const counters = new Map<string, number>();
  let resetAt = 0;
  return (req, res, next) => {
    const now = Date.now();
    if (now >= resetAt) {
      counters.clear();
      resetAt = now + windowMs;
    }
    const id = key(req);
    const count = counters.get(id) ?? 0;
    if (count >= limit || (!counters.has(id) && counters.size >= 10000)) {
      res.set('Retry-After', String(Math.ceil((resetAt - now) / 1000)));
      res.status(429).json({ success: false, message: 'Vui lòng thử lại sau' });
      return;
    }
    counters.set(id, count + 1);
    next();
  };
}
