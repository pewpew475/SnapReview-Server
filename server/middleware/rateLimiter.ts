import { Request, Response, NextFunction } from 'express';

// Simple in-memory rate limiter (for production, use Redis)
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

function getClientId(req: Request): string {
  const xff = req.headers['x-forwarded-for'];

  if (Array.isArray(xff)) {
    return xff[0] || req.ip;
  }

  if (typeof xff === 'string') {
    // In case of "ip1, ip2, ..."
    return xff.split(',')[0].trim();
  }

  return req.ip || 'unknown';
}

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const clientId = getClientId(req);
  const now = Date.now();

  // Clean up old entries
  for (const [key, value] of requestCounts.entries()) {
    if (value.resetTime < now) {
      requestCounts.delete(key);
    }
  }

  const clientData = requestCounts.get(clientId);

  if (!clientData || clientData.resetTime < now) {
    // First request or window expired
    requestCounts.set(clientId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return next();
  }

  if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
    });
  }

  // Increment count
  clientData.count++;
  next();
}
