import { sendRateLimitExceeded, sendServiceUnavailable } from './errorHandler.js';
import { RATE_LIMIT } from '../constants/rateLimit.js';

export async function applyRateLimit(request, response, options) {
  const { rateLimitService, logger, alertAdmin, retryAttempts = RATE_LIMIT.RETRY_ATTEMPTS, retryDelayMs = RATE_LIMIT.RETRY_DELAY_MS } = options;

  let lastError;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    try {
      const result = rateLimitService.checkRequest(request);

      if (!result.allowed) {
        const metadata = { userId: result.userId, count: result.count, limit: result.limit };
        logger.warn?.('Rate limit exceeded', metadata);
        alertAdmin?.(metadata);
        sendRateLimitExceeded(response, 'Rate limit exceeded');
        return false;
      }

      return true;
    } catch (error) {
      lastError = error;

      // Check if this is a network/transient error that should be retried
      const isTransientError = error.message.includes('ECONNRESET') ||
                              error.message.includes('ETIMEDOUT') ||
                              error.message.includes('ENOTFOUND') ||
                              error.message.includes('ECONNREFUSED') ||
                              error.message.includes('Rate limit service unavailable');

      if (!isTransientError || attempt === retryAttempts) {
        // Not a transient error or we've exhausted retries
        logger.error?.('Rate limit service unavailable', { message: error.message, attempt });
        sendServiceUnavailable(response, 'Service unavailable');
        return false;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      logger.warn?.('Retrying rate limit check', { attempt, maxAttempts: retryAttempts });
    }
  }

  // Should not reach here, but handle the case
  logger.error?.('Rate limit service unavailable after retries', { message: lastError?.message });
  sendServiceUnavailable(response, 'Service unavailable');
  return false;
}