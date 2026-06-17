export function createRateLimitService({ limit = 100, windowMs = 60_000 } = {}) {
  const userWindows = new Map();

  function getCurrentWindowStart() {
    const now = Date.now();
    return now - (now % windowMs);
  }

  return {
    checkRequest(request) {
      const failHeader = request.headers['x-rate-limit-service-fail'];
      if (failHeader && failHeader !== 'false') {
        throw new Error('Rate limit service unavailable');
      }

      const userId = request.headers['x-user-id'] ?? 'anonymous';
      const windowStart = getCurrentWindowStart();
      const currentWindow = userWindows.get(userId);

      let count;
      if (!currentWindow || currentWindow.windowStart !== windowStart) {
        count = 1;
      } else {
        count = currentWindow.count + 1;
      }

      userWindows.set(userId, { windowStart, count });

      return {
        allowed: count <= limit,
        userId,
        count,
        limit,
      };
    },
  };
}
