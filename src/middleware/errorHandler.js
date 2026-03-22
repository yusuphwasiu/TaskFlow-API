import { sendJson } from '../http.js';
import { ERROR_CODES } from '../constants/errors.js';

export function sendError(response, errorCode, customMessage = null) {
  const { statusCode, message } = errorCode;
  sendJson(response, statusCode, { error: customMessage ?? message });
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
