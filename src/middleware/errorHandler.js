import { sendJson } from '../http.js';
import { ERROR_CODES } from '../constants/errors.js';

export function sendError(response, errorCode, customMessage = null) {
  const { statusCode, message } = errorCode;

  const payload = {
    error: customMessage ?? message,
    standard: message,
  };

  // If a logger has been attached to the response, emit a structured log
  try {
    // If another part of the request already logged this error, skip duplicate logging
    if (response && response.__suppressErrorLog) {
      // do not log again
    } else {
      const logger = response && response.__logger;
      if (logger && typeof logger.error === 'function') {
        logger.error('API error', {
          statusCode,
          standard: message,
          detail: customMessage ?? null,
        });
      }
    }
  } catch (e) {
    // swallow logging errors to avoid masking the original response
  }

  sendJson(response, statusCode, payload);
}

export function sendBadRequest(response, msg = null) {
  sendError(response, ERROR_CODES.BAD_REQUEST, msg);
}

export function sendUnauthorized(response, msg = null) {
  sendError(response, ERROR_CODES.UNAUTHORIZED, msg);
}

export function sendForbidden(response, msg = null) {
  sendError(response, ERROR_CODES.FORBIDDEN, msg);
}

export function sendMissingParameter(response) {
  sendError(response, ERROR_CODES.MISSING_PARAMETER);
}

export function sendNotFound(response, msg = null) {
  sendError(response, ERROR_CODES.NOT_FOUND, msg);
}

export function sendRateLimitExceeded(response, msg = null) {
  sendError(response, ERROR_CODES.RATE_LIMIT_EXCEEDED, msg);
}

export function sendInternalServerError(response, msg = null) {
  sendError(response, ERROR_CODES.INTERNAL_SERVER_ERROR, msg);
}

export function sendServiceUnavailable(response, msg = null) {
  sendError(response, ERROR_CODES.SERVICE_UNAVAILABLE, msg);
}

export function handleUnexpectedError(response, logger, error) {
  if (logger?.error) {
    logger.error('Unexpected server error', {
      message: error?.message,
      stack: error?.stack,
    });
  }

  sendInternalServerError(response, ERROR_CODES.INTERNAL_SERVER_ERROR.message);
}