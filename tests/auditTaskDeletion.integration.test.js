import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createTaskStore } from '../src/services/taskStore.js';
import { createAuditStore } from '../src/services/auditStore.js';
import { createRateLimitService } from '../src/services/rateLimitService.js';

async function startTestServer(dependencies = {}) {
  const server = createApp(dependencies);

  await new Promise((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

test('AC-1: Audit logs are created for each deleted task', async () => {
  const auditStore = createAuditStore();
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore, auditStore });

  try {
    // Delete a task as user-1
    const response = await fetch(`${app.baseUrl}/api/tasks/task-1`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(response.status, 200);

    // Verify audit log was created
    const logs = auditStore.getAllLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].taskId, 'task-1');
    assert.equal(logs[0].userId, 'user-1');
    assert.ok(logs[0].deletedAt);
    assert.equal(logs[0].taskTitle, 'Define roles and permissions');
  } finally {
    await app.close();
  }
});

test('AC-2: The audit log retrieval endpoint returns logs in JSON format, supporting filtering by user ID and date range', async () => {
  const auditStore = createAuditStore();
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore, auditStore });

  try {
    // Delete a task as user-1
    await fetch(`${app.baseUrl}/api/tasks/task-1`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'user-1' },
    });

    // Retrieve audit logs without filters (admin permission required)
    const allResponse = await fetch(`${app.baseUrl}/api/audit/tasks`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(allResponse.status, 200);
    const allBody = await allResponse.json();
    assert.ok(Array.isArray(allBody.data));
    assert.equal(allBody.data.length, 1);

    // Filter by userId
    const userFilterResponse = await fetch(
      `${app.baseUrl}/api/audit/tasks?userId=user-1`,
      {
        headers: { 'x-user-id': 'admin-1' },
      }
    );

    assert.equal(userFilterResponse.status, 200);
    const userFilterBody = await userFilterResponse.json();
    assert.equal(userFilterBody.data.length, 1);
    assert.equal(userFilterBody.data[0].userId, 'user-1');

    // Filter by non-existent userId
    const noMatchResponse = await fetch(
      `${app.baseUrl}/api/audit/tasks?userId=nonexistent`,
      {
        headers: { 'x-user-id': 'admin-1' },
      }
    );

    assert.equal(noMatchResponse.status, 200);
    const noMatchBody = await noMatchResponse.json();
    assert.equal(noMatchBody.data.length, 0);
  } finally {
    await app.close();
  }
});

test('AC-3: Unauthorized users receive a 403 Forbidden response when attempting to access the audit logs', async () => {
  const auditStore = createAuditStore();
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore, auditStore });

  try {
    // Try to access audit logs as a viewer (does not have admin:manage permission)
    const response = await fetch(`${app.baseUrl}/api/audit/tasks`, {
      headers: { 'x-user-id': 'viewer-1' },
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.ok(body.error);
  } finally {
    await app.close();
  }
});

test('AC-4: If no logs match the specified filters, the API returns an empty array with a 200 OK response', async () => {
  const auditStore = createAuditStore();
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore, auditStore });

  try {
    // Request audit logs with a filter that matches nothing
    const response = await fetch(
      `${app.baseUrl}/api/audit/tasks?userId=nonexistent-user`,
      {
        headers: { 'x-user-id': 'admin-1' },
      }
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 0);
  } finally {
    await app.close();
  }
});

test('AC-5: Rate limiting is enforced on the audit log retrieval endpoint (10 requests per minute per user)', async () => {
  const auditStore = createAuditStore();
  const taskStore = createTaskStore();
  // Create audit rate limit service with 10 requests per minute
  const auditRateLimitService = createRateLimitService({
    limit: 10,
    windowMs: 60_000,
  });

  const app = await startTestServer({
    taskStore,
    auditStore,
    auditRateLimitService,
  });

  try {
    // Make 10 successful requests (should all succeed)
    for (let i = 0; i < 10; i += 1) {
      const response = await fetch(`${app.baseUrl}/api/audit/tasks`, {
        headers: { 'x-user-id': 'admin-1' },
      });

      assert.equal(response.status, 200, `Request ${i + 1} should succeed`);
    }

    // Make the 11th request (should be rate limited)
    const rateLimitedResponse = await fetch(`${app.baseUrl}/api/audit/tasks`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(rateLimitedResponse.status, 429);
    const body = await rateLimitedResponse.json();
    assert.ok(body.error);
  } finally {
    await app.close();
  }
});

test('Multiple deleted tasks create separate audit log entries', async () => {
  const auditStore = createAuditStore();
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore, auditStore });

  try {
    // Delete task-1 as user-1
    await fetch(`${app.baseUrl}/api/tasks/task-1`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'user-1' },
    });

    // Delete task-2 as admin-1
    await fetch(`${app.baseUrl}/api/tasks/task-2`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'admin-1' },
    });

    // Retrieve all audit logs
    const response = await fetch(`${app.baseUrl}/api/audit/tasks`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    const body = await response.json();
    assert.equal(body.data.length, 2);

    // Verify each log entry
    const userOneLogs = body.data.filter((log) => log.userId === 'user-1');
    assert.equal(userOneLogs.length, 1);
    assert.equal(userOneLogs[0].taskId, 'task-1');

    const adminLogs = body.data.filter((log) => log.userId === 'admin-1');
    assert.equal(adminLogs.length, 1);
    assert.equal(adminLogs[0].taskId, 'task-2');
  } finally {
    await app.close();
  }
});

test('Audit logs are filtered by date range correctly', async () => {
  const testLogs = [
    {
      id: 'audit-1',
      taskId: 'task-1',
      userId: 'user-1',
      deletedAt: '2026-06-15T10:00:00.000Z',
    },
    {
      id: 'audit-2',
      taskId: 'task-2',
      userId: 'user-1',
      deletedAt: '2026-06-17T10:00:00.000Z',
    },
    {
      id: 'audit-3',
      taskId: 'task-3',
      userId: 'user-1',
      deletedAt: '2026-06-19T10:00:00.000Z',
    },
  ];

  const auditStore = createAuditStore(testLogs);
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore, auditStore });

  try {
    // Filter by date range: 2026-06-16 to 2026-06-18
    const response = await fetch(
      `${app.baseUrl}/api/audit/tasks?startDate=2026-06-16T00:00:00Z&endDate=2026-06-18T23:59:59Z`,
      {
        headers: { 'x-user-id': 'admin-1' },
      }
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].taskId, 'task-2');
  } finally {
    await app.close();
  }
});
