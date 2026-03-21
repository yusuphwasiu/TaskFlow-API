import { createServer } from 'node:http';
import { isValidRole } from './constants/roles.js';
import { parseFormBody, parseJsonBody, parseRoleRoute, sendHtml, sendJson } from './http.js';
import { authorizeRequest } from './middleware/authorize.js';
import { createRoleService } from './services/roleService.js';
import { createUserStore } from './services/userStore.js';
import { renderRoleAdminPage } from './ui/roleAdminPage.js';

export function createApp(dependencies = {}) {
  const logger = dependencies.logger ?? console;
  const userStore = dependencies.userStore ?? createUserStore();
  const roleService = dependencies.roleService ?? createRoleService({ userStore });

  async function requestListener(request, response) {
    const url = new URL(request.url, 'http://localhost');

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
        sendJson(response, 400, { error: 'Invalid JSON body' });
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
        sendJson(response, 400, { error: 'Invalid JSON body' });
        return;
      }

      if (!isValidRole(payload.role)) {
        sendJson(response, 400, { error: 'Invalid role specified' });
        return;
      }

      const result = userStore.assignRole(roleRoute.userId, payload.role);

      if (result.error) {
        if (result.isServerError) {
          sendJson(response, 500, { error: result.error });
          return;
        }
        if (result.error === 'User not found') {
          sendJson(response, 404, { error: 'User not found' });
          return;
        }
        sendJson(response, 400, { error: result.error });
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
        const statusCode = result.error === 'User not found' ? 404 : 400;
        sendJson(response, statusCode, { error: result.error });
        return;
      }

      response.writeHead(303, { location: `/admin/roles?asUser=${encodeURIComponent(user.id)}` });
      response.end();
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  }

  return createServer(requestListener);
}
