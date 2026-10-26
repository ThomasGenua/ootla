import type { NextFunction, Request, Response } from 'express';
import type { ServerConfig } from '../config/env.js';
import { ApiError } from '../http/errors.js';

export function protectOrigin(config: ServerConfig) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const origin = request.headers.origin;
    if (origin !== config.appUrl || request.headers['sec-fetch-site'] === 'cross-site') {
      throw new ApiError(403, 'ORIGIN_DENIED', 'Open Ootla using its usual web address and try again.');
    }
    next();
  };
}

type AttemptBucket = { attempts: number; resetAt: number };

/** Single-process foundation limit. Use a shared store before running multiple API instances. */
export function loginRateLimit() {
  const attempts = new Map<string, AttemptBucket>();
  const windowMs = 15 * 60 * 1000;
  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    for (const [key, bucket] of attempts) if (bucket.resetAt <= now) attempts.delete(key);
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    let bucket = attempts.get(key);
    if (!bucket) {
      if (attempts.size >= 10_000) throw new ApiError(429, 'LOGIN_LIMITED', 'Too many sign-in attempts. Try again later.');
      bucket = { attempts: 0, resetAt: now + windowMs };
      attempts.set(key, bucket);
    }
    bucket.attempts += 1;
    if (bucket.attempts > 15) {
      response.setHeader('Retry-After', Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
      throw new ApiError(429, 'LOGIN_LIMITED', 'Too many sign-in attempts. Try again in 15 minutes.');
    }
    next();
  };
}
