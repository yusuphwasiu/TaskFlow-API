export const ERROR_CODES = {
  BAD_REQUEST: {
    statusCode: 400,
    message: 'Bad Request',
  },
  UNAUTHORIZED: {
    statusCode: 401,
    message: 'Authentication required',
  },
  FORBIDDEN: {
    statusCode: 403,
    message: 'Forbidden',
  },
  NOT_FOUND: {
    statusCode: 404,
    message: 'Not Found',
  },
  RATE_LIMIT_EXCEEDED: {
    statusCode: 429,
    message: 'Rate limit exceeded',
  },
  INTERNAL_SERVER_ERROR: {
    statusCode: 500,
    message: 'Internal Server Error',
  },
  SERVICE_UNAVAILABLE: {
    statusCode: 503,
    message: 'Service Unavailable',
  },
};