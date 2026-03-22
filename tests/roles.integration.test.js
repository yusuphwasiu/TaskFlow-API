import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function startTestServer(logger = console) {
  const server = createApp({ logger });

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

test('AC-1: admin has access to admin operations', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/api/admin/audit`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.requestedBy, 'admin-1');
  } finally {
    await app.close();
  }
});

test('AC-2: regular user is denied admin operations with 403', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/api/admin/audit`, {
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'Forbidden');
  } finally {
    await app.close();
  }
});

test('AC-3: user with no role is denied API actions with 401', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks`, {
      headers: { 'x-user-id': 'norole-1' },
    });

    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, 'Authentication required');
  } finally {
    await app.close();
  }
});

test('AC-4: role retrieval failure is logged and returns 503', async () => {
  const errors = [];
  const logger = {
    error(message, metadata) {
      errors.push({ message, metadata });
    },
  };

  const app = await startTestServer(logger);

  try {
    const response = await fetch(`${app.baseUrl}/api/admin/audit`, {
      headers: {
        'x-user-id': 'admin-1',
        'x-role-service-fail': 'true',
      },
    });

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'Service Unavailable');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'Role retrieval failed');
    assert.equal(errors[0].metadata.message, 'Role retrieval service unavailable');
  } finally {
    await app.close();
  }
});

test('admin can assign a new role through the API endpoint', async () => {
  const app = await startTestServer();

  try {
    const updateResponse = await fetch(`${app.baseUrl}/api/admin/users/norole-1/role`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'admin-1',
      },
      body: JSON.stringify({ role: 'viewer' }),
    });

    assert.equal(updateResponse.status, 200);

    const tasksResponse = await fetch(`${app.baseUrl}/api/tasks`, {
      headers: { 'x-user-id': 'norole-1' },
    });

    assert.equal(tasksResponse.status, 200);
  } finally {
    await app.close();
  }
});

test('admin role-assignment UI is accessible to admins and blocked for regular users', async () => {
  const app = await startTestServer();

  try {
    const adminResponse = await fetch(`${app.baseUrl}/admin/roles?asUser=admin-1`);
    assert.equal(adminResponse.status, 200);
    const adminHtml = await adminResponse.text();
    assert.match(adminHtml, /Role assignment/);

    const userResponse = await fetch(`${app.baseUrl}/admin/roles?asUser=user-1`);
    assert.equal(userResponse.status, 403);
  } finally {
    await app.close();
  }
});

test('AC-2: invalid role returns 400 with "Invalid role specified" message', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/api/admin/users/user-1/role`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'admin-1',
      },
      body: JSON.stringify({ role: 'invalid-role' }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'Invalid role specified');
  } finally {
    await app.close();
  }
});

test('AC-3: existing user with Viewer role upgraded to Editor has immediate access to new permissions', async () => {
  const app = await startTestServer();

  try {
    // First verify viewer can only read tasks
    const viewerReadResponse = await fetch(`${app.baseUrl}/api/tasks`, {
      headers: { 'x-user-id': 'viewer-1' },
    });
    assert.equal(viewerReadResponse.status, 200);

    // Viewer should not be able to create tasks
    const viewerWriteResponse = await fetch(`${app.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'viewer-1',
      },
      body: JSON.stringify({ title: 'New task' }),
    });
    assert.equal(viewerWriteResponse.status, 403);

    // Upgrade viewer to editor (user role includes write permission)
    const upgradeResponse = await fetch(`${app.baseUrl}/api/admin/users/viewer-1/role`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'admin-1',
      },
      body: JSON.stringify({ role: 'user' }),
    });
    assert.equal(upgradeResponse.status, 200);

    // Now the user should be able to write tasks without re-login
    const editorWriteResponse = await fetch(`${app.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'viewer-1',
      },
      body: JSON.stringify({ title: 'New task' }),
    });
    assert.equal(editorWriteResponse.status, 201);
  } finally {
    await app.close();
  }
});

test('AC-4: database error during role assignment returns 500 with appropriate message', async () => {
  const { createApp } = await import('../src/app.js');
  const { createUserStore } = await import('../src/services/userStore.js');
  const logger = console;

  // Create a user store that will fail role assignment
  const failingUserStore = createUserStore(undefined, { shouldFailAssignRole: true });
  const app = createApp({ logger, userStore: failingUserStore });

  await new Promise((resolve) => {
    app.listen(0, resolve);
  });

  const address = app.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/admin/users/user-1/role`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'admin-1',
      },
      body: JSON.stringify({ role: 'viewer' }),
    });

    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, 'Role assignment failed due to server error');
  } finally {
    await new Promise((resolve, reject) => {
      app.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

