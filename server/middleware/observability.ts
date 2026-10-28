import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

// Never log paths, query strings, bodies, cookies, provider replies or user data.
export const requestDiagnostics: RequestHandler = (request, response, next) => {
  const requestId = randomUUID(), started = performance.now();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  response.once('finish', () => {
    const durationMs = Math.round(performance.now() - started);
    if (response.statusCode >= 500 || durationMs >= 2000) {
      console.error(JSON.stringify({ event: 'http.request', requestId, method: request.method,
        status: response.statusCode, durationMs }));
    }
  });
  next();
};
