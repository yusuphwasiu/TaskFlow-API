/**
 * Validation utilities for input data
 */

/**
 * Validates a task ID format
 * Valid task IDs:
 * - Contain only alphanumeric characters, hyphens, and underscores
 * - Are not empty
 * - Are not longer than 255 characters
 *
 * @param {string} taskId - The task ID to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidTaskId(taskId) {
  if (typeof taskId !== 'string') {
    return false;
  }

  if (taskId.length === 0 || taskId.length > 255) {
    return false;
  }

  // Allow alphanumeric, hyphens, underscores, and dots
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  return validPattern.test(taskId);
}
