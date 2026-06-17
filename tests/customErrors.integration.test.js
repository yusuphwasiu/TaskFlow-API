import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createUserStore } from '../src/services/userStore.js';

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

test('Standard and Custom Error Message for Server Error', async () => {
  const failingUserStore = createUserStore(undefined, { shouldFailAssignRole: true });
  const app = await startTestServer({ userStore: failingUserStore });

  try {
    const response = await fetch(`${app.baseUrl}/api/admin/users/user-1/role`, {
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
    assert.equal(body.standard, 'Internal server error');
  } finally {
    await app.close();
  }
});

test('Custom Error Message for Invalid Request Format', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'user-1',
      },
      // send invalid JSON
      body: '{ invalid json',
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'Invalid JSON body');
    assert.equal(body.standard, 'Bad Request');
  } finally {
    await app.close();
  }
});

test('Handling Multiple Simultaneous Failed Requests', async () => {
  const app = await startTestServer();

  try {
    const requests = [
      fetch(`${app.baseUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'user-1' },
        body: '{ invalid',
      }),
      fetch(`${app.baseUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'user-1' },
        body: '{ also invalid',
      }),
    ];

    const results = await Promise.all(requests);
    for (const res of results) {
      assert.equal(res.status, 400);
      const b = await res.json();
      assert.equal(b.standard, 'Bad Request');
      assert.equal(typeof b.error, 'string');
    }
  } finally {
    await app.close();
  }
});

test('Custom Error Message for Unauthorized Access', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/api/admin/audit`, {
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.standard, 'Forbidden');
    assert.equal(body.error, 'Forbidden');
  } finally {
    await app.close();
  }
});
