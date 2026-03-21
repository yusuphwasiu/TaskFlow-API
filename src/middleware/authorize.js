import { hasPermission } from '../constants/roles.js';
import { sendJson } from '../http.js';

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
      sendJson(response, 401, { error: 'Authentication required' });
      return null;
    }

    if (permission && !hasPermission(user.role, permission)) {
      sendJson(response, 403, { error: 'Forbidden' });
      return null;
    }

    return user;
  } catch (error) {
    logger.error('Role retrieval failed', { message: error.message });
    sendJson(response, 503, { error: 'Role service unavailable' });
    return null;
  }
}
