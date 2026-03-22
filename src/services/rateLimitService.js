import { RATE_LIMIT } from '../constants/rateLimit.js';

export function createRateLimitService(options = {}) {
  const maxRequestsPerMinute = options.maxRequestsPerMinute ?? RATE_LIMIT.MAX_REQUESTS_PER_MINUTE;
  const windowMs = options.windowMs ?? RATE_LIMIT.WINDOW_MS;

  const store = new Map();

  function getUserId(request) {
    return request.headers['x-user-id'] ?? request.socket.remoteAddress ?? 'anonymous';
  }

  function checkRequest(request) {
    const failing = request.headers['x-rate-limit-service-fail'];

    if (failing && failing !== 'false') {
      throw new Error('Rate limit service unavailable');
    }

    const userId = getUserId(request);
    const now = Date.now();

    const current = store.get(userId) ?? { count: 0, windowStart: now };

    if (now - current.windowStart >= windowMs) {
      current.count = 0;
      current.windowStart = now;
    }

    current.count += 1;
    store.set(userId, current);

    const allowed = current.count <= maxRequestsPerMinute;

    return {
      userId,
      allowed,
      count: current.count,
      limit: maxRequestsPerMinute,
      windowStart: current.windowStart,
    };
  }

  function reset() {
    store.clear();
  }

  return { checkRequest, reset };
}
