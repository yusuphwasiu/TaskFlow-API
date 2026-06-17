import { hasPermission } from '../constants/roles.js';
import { sendUnauthorized, sendForbidden, sendServiceUnavailable } from '../middleware/errorHandler.js';

export async function authorizeRequest(request, response, options) {
  const { permission, roleService, logger, actingUserId } = options;

  try {
    const originalUserId = request.headers['x-user-id'];

    if (actingUserId) {
      request.headers['x-user-id'] = actingUserId;
    }

    const user = roleService.getUserContext(request);

    if (originalUserId !== undefined) {
      request.headers['x-user-id'] = originalUserId;
    }

    if (!user) {
      sendUnauthorized(response);
      return null;
    }

    if (permission && !hasPermission(user.role, permission)) {
      sendForbidden(response);
      return null;
    }

    return user;
  } catch (error) {
    logger.error('Role retrieval failed', { message: error.message });
    // Mark the response to avoid duplicate logging in the central error handler
    try {
      if (response) response.__suppressErrorLog = true;
    } catch (e) {}
    sendServiceUnavailable(response, 'Role service unavailable');
    return null;
  }
}
