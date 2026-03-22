import { sendRateLimitExceeded, sendServiceUnavailable } from './errorHandler.js';

export async function applyRateLimit(request, response, options) {
  const { rateLimitService, logger } = options;

  try {
    const result = rateLimitService.checkRequest(request);

    if (!result.allowed) {
      logger.warn?.('Rate limit exceeded', { userId: result.userId, count: result.count, limit: result.limit });
      sendRateLimitExceeded(response, 'Rate limit exceeded');
      return false;
    }

    return true;
  } catch (error) {
    logger.error?.('Rate limit service unavailable', { message: error.message });
    sendServiceUnavailable(response, 'Service Unavailable');
    return false;
  }
}