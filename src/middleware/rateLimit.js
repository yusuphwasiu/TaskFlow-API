import { sendJson } from '../http.js';

export async function applyRateLimit(request, response, options) {
  const { rateLimitService, logger } = options;

  try {
    const result = rateLimitService.checkRequest(request);

    if (!result.allowed) {
      logger.warn?.('Rate limit exceeded', { userId: result.userId, count: result.count, limit: result.limit });
      sendJson(response, 429, { error: 'Rate limit exceeded' });
      return false;
    }

    return true;
  } catch (error) {
    logger.error?.('Rate limit service unavailable', { message: error.message });
    sendJson(response, 503, { error: 'Service Unavailable' });
    return false;
  }
}
