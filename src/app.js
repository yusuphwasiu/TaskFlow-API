import { createServer } from 'node:http';
import { isValidRole, ROLES, PERMISSIONS, VALID_ROLES, hasPermission } from './constants/roles.js';
import { parseFormBody, parseJsonBody, parseRoleRoute, sendHtml, sendJson } from './http.js';
import { authorizeRequest } from './middleware/authorize.js';
import { applyRateLimit } from './middleware/rateLimit.js';
import { isValidTaskId } from './utils/validation.js';
import {
  sendBadRequest,
  sendMissingParameter,
  sendNotFound,
  sendForbidden,
  sendInternalServerError,
  sendServiceUnavailable,
  sendMethodNotAllowed,
  sendRequestTimeout,
  sendUnsupportedMediaType,
  handleUnexpectedError,
} from './middleware/errorHandler.js';
import { createRoleService } from './services/roleService.js';
import { createRateLimitService } from './services/rateLimitService.js';
import { createUserStore } from './services/userStore.js';
import { createTaskStore } from './services/taskStore.js';
import { createAuditStore } from './services/auditStore.js';
import { renderRoleAdminPage } from './ui/roleAdminPage.js';
import { renderTaskPage } from './ui/taskPage.js';

export function createApp(dependencies = {}) {
  const logger =
    dependencies && typeof dependencies.error === 'function'
      ? dependencies
      : dependencies.logger ?? console;
  const userStore = dependencies.userStore ?? createUserStore();
  const roleService = dependencies.roleService ?? createRoleService({ userStore });
  const rateLimitService = dependencies.rateLimitService ?? createRateLimitService();
  const auditRateLimitService =
    dependencies.auditRateLimitService ??
    createRateLimitService({ limit: 10, windowMs: 60_000 });
  const taskStore = dependencies.taskStore ?? createTaskStore();
  const auditStore = dependencies.auditStore ?? createAuditStore();
  const alertAdmin = dependencies.alertAdmin ?? (() => {});

  async function requestListener(request, response) {
    // Attach the request-scoped logger to the response so middleware can log structured errors
    response.__logger = logger;
    const url = new URL(request.url, 'http://localhost');

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

    if (request.method === 'GET' && url.pathname === '/tasks') {
      const actingUserId = url.searchParams.get('asUser') ?? request.headers['x-user-id'];
      const user = await authorizeRequest(request, response, {
        permission: 'tasks:read',
        roleService,
        logger,
        actingUserId,
      });

      if (!user) {
        return;
      }

      sendHtml(response, 200, renderTaskPage(taskStore.getAllTasksForUser(user), user.id));
      return;
    }

    const taskDeleteMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);

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
        data: taskStore.getAllTasksForUser(user),
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

      // Ensure content type is JSON
      const contentType = request.headers['content-type'] ?? '';
      if (contentType && !contentType.includes('application/json')) {
        // Unsupported media type
        sendUnsupportedMediaType(response, 'Unsupported media type');
        return;
      }

      try {
        payload = await parseJsonBody(request);
      } catch {
        sendBadRequest(response, 'Invalid JSON body');
        return;
      }

      if (!payload.title) {
        sendMissingParameter(response);
        return;
      }

      const result = taskStore.createTask({
        title: payload.title,
        assignedTo: user.id,
        visibleTo: user.role,
      });

      sendJson(response, 201, {
        data: result.task,
      });
      return;
    }

    // If `/api/tasks` exists but HTTP method is not allowed, return 405
    if (url.pathname === '/api/tasks' && request.method !== 'GET' && request.method !== 'POST') {
      sendMethodNotAllowed(response, 'Method not allowed');
      return;
    }

    // Simulation endpoints to support failure scenario tests
    if (request.method === 'GET' && url.pathname === '/simulate/timeout') {
      sendRequestTimeout(response, 'Request timed out');
      return;
    }

    if (request.method === 'GET' && url.pathname === '/simulate/unavailable') {
      sendServiceUnavailable(response);
      return;
    }

    if (request.method === 'DELETE' && taskDeleteMatch) {
      const user = await authorizeRequest(request, response, {
        permission: 'tasks:write',
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      const taskId = decodeURIComponent(taskDeleteMatch[1]);
      
      // Validate task ID format
      if (!isValidTaskId(taskId)) {
        sendBadRequest(response, 'Invalid task ID');
        return;
      }
      const task = taskStore.getTaskById(taskId);

      if (!task) {
        sendNotFound(response, 'Not Found');
        return;
      }

      if (task.assignedTo !== user.id) {
        sendForbidden(response, 'You are not authorized to delete this task');
        return;
      }

      function attemptDeleteWithRetries(id, attempts = 3) {
        let lastResult;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          const result = taskStore.deleteTask(id);

          if (result.success) {
            return result;
          }

          lastResult = result;

          if (!result.isTransient) {
            break;
          }
        }

        return lastResult;
      }

      const deleteResult = attemptDeleteWithRetries(taskId, 3);

      if (deleteResult.success) {
        // Log the deletion to audit store
        auditStore.logDeletedTask(taskId, user.id, {
          title: task.title,
          userRole: user.role,
        });
        sendJson(response, 200, { data: { id: taskId, deleted: true } });
        return;
      }

      if (deleteResult.error === 'Task not found') {
        sendNotFound(response, 'Not Found');
        return;
      }

      if (deleteResult.isTransient) {
        sendServiceUnavailable(response, 'Deletion failed, please try again later');
        return;
      }

      sendInternalServerError(response, 'Deletion failed, please try again later');
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/audit/tasks') {
      // Require admin:manage permission to access audit logs
      const user = await authorizeRequest(request, response, {
        permission: 'admin:manage',
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      // Apply rate limiting: 10 requests per minute per user
      const allowed = await applyRateLimit(request, response, {
        rateLimitService: auditRateLimitService,
        logger,
        alertAdmin,
      });

      if (!allowed) {
        return;
      }

      // Parse query filters
      const filters = {};
      const queryUserId = url.searchParams.get('userId');
      const queryTaskId = url.searchParams.get('taskId');
      const queryStartDate = url.searchParams.get('startDate');
      const queryEndDate = url.searchParams.get('endDate');

      if (queryUserId) {
        filters.userId = queryUserId;
      }
      if (queryTaskId) {
        filters.taskId = queryTaskId;
      }
      if (queryStartDate) {
        filters.startDate = queryStartDate;
      }
      if (queryEndDate) {
        filters.endDate = queryEndDate;
      }

      // Retrieve filtered audit logs
      const logs = auditStore.getAuditLogs(filters);

      // AC-5: If taskId is provided and no logs match, return 404
      if (queryTaskId && logs.length === 0) {
        sendNotFound(response, 'Not Found');
        return;
      }

      sendJson(response, 200, {
        data: logs,
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/audit/purge') {
      // Require admin:manage permission to purge old logs
      const user = await authorizeRequest(request, response, {
        permission: 'admin:manage',
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      // Purge old logs based on retention policy
      const result = auditStore.purgeOldLogs();

      sendJson(response, 200, {
        data: {
          purgedCount: result.purgedCount,
          remainingCount: result.remainingCount,
          retentionPeriodDays: auditStore.getRetentionPeriod(),
        },
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/checkout') {
      const user = await authorizeRequest(request, response, {
        roleService,
        logger,
      });

      if (!user) {
        return;
      }

      const allowed = await applyRateLimit(request, response, {
        rateLimitService,
        logger,
        alertAdmin,
      });

      if (!allowed) {
        return;
      }

      sendJson(response, 200, {
        data: {
          action: 'checkout',
          userId: user.id,
          status: 'processed',
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
        sendBadRequest(response, 'Invalid JSON body');
        return;
      }

      if (!payload.role) {
        sendMissingParameter(response);
        return;
      }

      if (!isValidRole(payload.role)) {
        sendBadRequest(response, 'Invalid role specified');
        return;
      }

      const result = userStore.assignRole(roleRoute.userId, payload.role);

      if (result.error) {
        if (result.isServerError) {
          sendInternalServerError(response, 'Role assignment failed due to server error');
          return;
        }
        if (result.error === 'User not found') {
          sendNotFound(response, 'User not found');
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

      if (!formData.role) {
        sendMissingParameter(response);
        return;
      }

      const result = userStore.assignRole(formData.userId, formData.role);

      if (result.error) {
        if (result.isServerError) {
          sendInternalServerError(response, 'Role assignment failed due to server error');
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
  } catch (error) {
    handleUnexpectedError(response, logger, error);
  }
  }

  return createServer(requestListener);
}
