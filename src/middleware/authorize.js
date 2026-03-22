import { hasPermission } from '../constants/roles.js';
import { sendUnauthorized, sendForbidden, sendServiceUnavailable } from './errorHandler.js';

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
      sendUnauthorized(response, 'Authentication required');
      return null;
    }

    if (permission && !hasPermission(user.role, permission)) {
      sendForbidden(response, 'Forbidden');
      return null;
    }

    return user;
  } catch (error) {
    logger.error('Role retrieval failed', { message: error.message });
    sendServiceUnavailable(response, 'Service Unavailable');
    return null;
  }
}
