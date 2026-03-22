import test from 'node:test';
import { createApp } from '../src/app.js';
import assert from 'node:assert/strict';

async function startTestServer(options = {}) {
  const app = createApp(options);

  await new Promise((resolve) => {
    app.listen(0, resolve);
  });

  const address = app.address();

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => {
        app.close((error) => {
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

test('GET /api/roles returns all available roles with permissions', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/roles`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert(body.data);
    assert(Array.isArray(body.data));
    assert(body.data.length === 3); // admin, user, viewer

    // Check that each role has the expected structure
    const adminRole = body.data.find(r => r.name === 'admin');
    const userRole = body.data.find(r => r.name === 'user');
    const viewerRole = body.data.find(r => r.name === 'viewer');

    assert(adminRole);
    assert(userRole);
    assert(viewerRole);

    assert.deepEqual(adminRole.permissions, ['*']);
    assert.deepEqual(userRole.permissions, ['tasks:read', 'tasks:write', 'profile:read']);
    assert.deepEqual(viewerRole.permissions, ['tasks:read', 'profile:read']);
  } finally {
    await server.close();
  }
});

test('GET /api/roles/{role} returns specific role details', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/roles/admin`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.name, 'admin');
    assert.deepEqual(body.data.permissions, ['*']);
  } finally {
    await server.close();
  }
});

test('GET /api/roles/{invalid-role} returns 404', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/roles/invalid-role`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error, 'Not Found');
  } finally {
    await server.close();
  }
});

test('GET /api/users/{userId}/role returns user role for self', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/users/admin-1/role`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.userId, 'admin-1');
    assert.equal(body.data.role, 'admin');
  } finally {
    await server.close();
  }
});

test('GET /api/users/{userId}/role allows admin to view any user role', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/users/user-1/role`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.userId, 'user-1');
    assert.equal(body.data.role, 'user');
  } finally {
    await server.close();
  }
});

test('GET /api/users/{userId}/role denies non-admin viewing other users', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/users/admin-1/role`, {
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'Forbidden');
  } finally {
    await server.close();
  }
});

test('GET /api/users/{nonexistent-user}/role returns 404', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/users/nonexistent-user/role`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error, 'Not Found');
  } finally {
    await server.close();
  }
});

test('GET /api/permissions returns all available permissions', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/permissions`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert(body.data);
    assert(Array.isArray(body.data));

    // Should include all permissions from all roles
    assert(body.data.includes('tasks:read'));
    assert(body.data.includes('tasks:write'));
    assert(body.data.includes('profile:read'));
    assert(body.data.includes('*'));

    // Should be sorted
    assert.deepEqual(body.data, [...body.data].sort());
  } finally {
    await server.close();
  }
});

test('Role introspection endpoints require authentication', async () => {
  const server = await startTestServer();

  try {
    const endpoints = [
      '/api/roles',
      '/api/roles/admin',
      '/api/users/admin-1/role',
      '/api/permissions',
    ];

    for (const endpoint of endpoints) {
      const response = await fetch(`${server.baseUrl}${endpoint}`);
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.error, 'Authentication required');
    }
  } finally {
    await server.close();
  }
});
