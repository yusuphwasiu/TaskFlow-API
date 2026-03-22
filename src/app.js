import { createServer } from 'node:http';
import { isValidRole, ROLES, PERMISSIONS, VALID_ROLES, hasPermission } from './constants/roles.js';
import { parseFormBody, parseJsonBody, parseRoleRoute, sendHtml, sendJson } from './http.js';
import { authorizeRequest } from './middleware/authorize.js';
import { applyRateLimit } from './middleware/rateLimit.js';
import { sendBadRequest, sendNotFound, sendForbidden } from './middleware/errorHandler.js';
import { sendBadRequest, sendNotFound } from './middleware/errorHandler.js';
import { createRoleService } from './services/roleService.js';
import { createUserStore } from './services/userStore.js';
import { createRateLimitService } from './services/rateLimitService.js';
import { renderRoleAdminPage } from './ui/roleAdminPage.js';

export function createApp(dependencies = {}) {
  const logger = dependencies.logger ?? console;
  const userStore = dependencies.userStore ?? createUserStore();
  const roleService = dependencies.roleService ?? createRoleService({ userStore });
  const rateLimitService = dependencies.rateLimitService ?? createRateLimitService();

  async function requestListener(request, response) {
    const url = new URL(request.url, 'http://localhost');

    const ok = await applyRateLimit(request, response, { rateLimitService, logger });
    if (!ok) {
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/tasks') {
      const user = await authorizeRequest(request, response, {
        permission: 'tasks:read',
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      sendJson(response, 200, {
        data: [{ id: 'task-1', title: 'Define roles and permissions', visibleTo: user.role }],
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/tasks') {
      const user = await authorizeRequest(request, response, {
        permission: 'tasks:write',
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      let payload;

      try {
        payload = await parseJsonBody(request);
      } catch {
        sendBadRequest(response, 'Bad Request');
        return;
      }

      sendJson(response, 201, {
        data: {
          id: 'task-created-1',
          title: payload.title ?? 'Untitled task',
          createdBy: user.id,
        },
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/audit') {
      const user = await authorizeRequest(request, response, {
        permission: 'admin:manage',
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      sendJson(response, 200, {
        data: { action: 'audit-log-export', requestedBy: user.id },
      });
      return;
    }

    const roleRoute = parseRoleRoute(url.pathname);

    if (request.method === 'PUT' && roleRoute) {
      const user = await authorizeRequest(request, response, {
        permission: 'admin:manage',
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      let payload;

      try {
        payload = await parseJsonBody(request);
      } catch {
        sendBadRequest(response, 'Bad Request');
        return;
      }

      if (!isValidRole(payload.role)) {
        sendBadRequest(response, 'Invalid role specified');
        return;
      }

      const result = userStore.assignRole(roleRoute.userId, payload.role);

      if (result.error) {
        if (result.isServerError) {
          sendJson(response, 500, { error: result.error });
          return;
        }
        if (result.error === 'User not found') {
          sendNotFound(response, 'Not Found');
          return;
        }
        sendBadRequest(response, result.error);
        return;
      }

      sendJson(response, 200, { data: result.user });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/roles') {
      const actingUserId = url.searchParams.get('asUser') ?? request.headers['x-user-id'];
      const user = await authorizeRequest(request, response, {
        permission: 'admin:manage',
        roleService,
        logger,
        actingUserId,
      });

      if (!user) {
        return;
      }

      sendHtml(response, 200, renderRoleAdminPage(userStore.getAllUsers(), user.id));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/roles') {
      const actingUserId = url.searchParams.get('asUser') ?? request.headers['x-user-id'];
      const user = await authorizeRequest(request, response, {
        permission: 'admin:manage',
        roleService,
        logger,
        actingUserId,
      });

      if (!user) {
        return;
      }

      const formData = await parseFormBody(request);
      const result = userStore.assignRole(formData.userId, formData.role);

      if (result.error) {
        if (result.isServerError) {
          sendJson(response, 500, { error: result.error });
          return;
        }
        if (result.error === 'User not found') {
          sendNotFound(response, 'Not Found');
          return;
        }
        sendBadRequest(response, result.error);
        return;
      }

      response.writeHead(303, { location: `/admin/roles?asUser=${encodeURIComponent(user.id)}` });
      response.end();
      return;
    }

    // Role introspection endpoints
    if (request.method === 'GET' && url.pathname === '/api/roles') {
      const user = await authorizeRequest(request, response, {
        permission: 'profile:read',
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      sendJson(response, 200, {
        data: VALID_ROLES.map(role => ({
          name: role,
          permissions: PERMISSIONS[role] ?? [],
        })),
      });
      return;
    }

    // Parse role detail route: /api/roles/{role}
    const roleDetailMatch = url.pathname.match(/^\/api\/roles\/([^/]+)$/);
    if (request.method === 'GET' && roleDetailMatch) {
      const user = await authorizeRequest(request, response, {
        permission: 'profile:read',
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      const requestedRole = decodeURIComponent(roleDetailMatch[1]);

      if (!isValidRole(requestedRole)) {
        sendNotFound(response, 'Not Found');
        return;
      }

      sendJson(response, 200, {
        data: {
          name: requestedRole,
          permissions: PERMISSIONS[requestedRole] ?? [],
        },
      });
      return;
    }

    // Parse user role route: /api/users/{userId}/role
    const userRoleMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/role$/);
    if (request.method === 'GET' && userRoleMatch) {
      const user = await authorizeRequest(request, response, {
        permission: 'profile:read',
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      const requestedUserId = decodeURIComponent(userRoleMatch[1]);

      // Users can only view their own role, admins can view any role
      if (user.id !== requestedUserId && !hasPermission(user.role, 'admin:manage')) {
        sendForbidden(response, 'Forbidden');
        return;
      }

      const requestedUser = userStore.getUserById(requestedUserId);

      if (!requestedUser) {
        sendNotFound(response, 'Not Found');
        return;
      }

      sendJson(response, 200, {
        data: {
          userId: requestedUser.id,
          role: requestedUser.role,
        },
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/permissions') {
      const user = await authorizeRequest(request, response, {
        permission: 'profile:read',
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      // Extract all unique permissions from all roles
      const allPermissions = new Set();
      Object.values(PERMISSIONS).forEach(rolePermissions => {
        rolePermissions.forEach(permission => allPermissions.add(permission));
      });

      sendJson(response, 200, {
        data: Array.from(allPermissions).sort(),
      });
      return;
    }

    sendNotFound(response, 'Not Found');
  }

  return createServer(requestListener);
}
