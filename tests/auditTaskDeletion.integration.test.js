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
    maxRequestsPerHour: 10,
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

test('AC-5: Returns 404 when taskId filter does not match any logs', async () => {
  const auditStore = createAuditStore();
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore, auditStore });

  try {
    // Request audit logs with a non-existent taskId
    const response = await fetch(`${app.baseUrl}/api/audit/tasks?taskId=non-existent-task`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 404);
    const body = await response.json();
    assert.ok(body.error);
  } finally {
    await app.close();
  }
});

test('AC-5: Returns 200 when taskId filter matches existing logs', async () => {
  const auditStore = createAuditStore();
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore, auditStore });

  try {
    // Delete a task to create an audit log
    await fetch(`${app.baseUrl}/api/tasks/task-1`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'user-1' },
    });

    // Request audit logs with the existing taskId
    const response = await fetch(`${app.baseUrl}/api/audit/tasks?taskId=task-1`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].taskId, 'task-1');
  } finally {
    await app.close();
  }
});

test('AC-5: Returns 404 when taskId and userId filters both match nothing', async () => {
  const auditStore = createAuditStore();
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore, auditStore });

  try {
    // Request audit logs with both taskId and userId that match nothing
    const response = await fetch(
      `${app.baseUrl}/api/audit/tasks?taskId=non-existent-task&userId=non-existent-user`,
      {
        headers: { 'x-user-id': 'admin-1' },
      }
    );

    assert.equal(response.status, 404);
  } finally {
    await app.close();
  }
});

test('AC-6: Retention policy purges old logs', async () => {
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 10); // 10 days ago

  const testLogs = [
    {
      id: 'audit-old',
      taskId: 'task-old',
      userId: 'user-1',
      deletedAt: oldDate.toISOString(),
    },
    {
      id: 'audit-recent',
      taskId: 'task-recent',
      userId: 'user-1',
      deletedAt: recentDate.toISOString(),
    },
  ];

  // Create audit store with 90-day retention period
  const auditStore = createAuditStore(testLogs, { retentionPeriodDays: 90 });
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore, auditStore });

  try {
    // Trigger purge
    const purgeResponse = await fetch(`${app.baseUrl}/api/audit/purge`, {
      method: 'POST',
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(purgeResponse.status, 200);
    const purgeBody = await purgeResponse.json();
    assert.equal(purgeBody.data.purgedCount, 1);
    assert.equal(purgeBody.data.remainingCount, 1);
    assert.equal(purgeBody.data.retentionPeriodDays, 90);

    // Verify old log was purged and recent log remains
    const logsResponse = await fetch(`${app.baseUrl}/api/audit/tasks`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    const logsBody = await logsResponse.json();
    assert.equal(logsBody.data.length, 1);
    assert.equal(logsBody.data[0].taskId, 'task-recent');
  } finally {
    await app.close();
  }
});

test('AC-6: Retention period is configurable', async () => {
  const auditStore = createAuditStore([], { retentionPeriodDays: 30 });
  assert.equal(auditStore.getRetentionPeriod(), 30);

  const auditStoreDefault = createAuditStore([]);
  assert.equal(auditStoreDefault.getRetentionPeriod(), 90);
});

test('AC-6: Purge endpoint requires admin permission', async () => {
  const auditStore = createAuditStore();
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore, auditStore });

  try {
    // Try to purge as a non-admin user
    const response = await fetch(`${app.baseUrl}/api/audit/purge`, {
      method: 'POST',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(response.status, 403);
  } finally {
    await app.close();
  }
});
