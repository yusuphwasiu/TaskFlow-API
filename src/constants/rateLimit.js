export const RATE_LIMIT = {
  MAX_REQUESTS_PER_HOUR: 100,
  WINDOW_MS: 60 * 60 * 1000, // 1 hour in milliseconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 100,
};
