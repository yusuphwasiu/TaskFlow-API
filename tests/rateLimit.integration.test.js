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


test('AC-1: Under rate limit requests are processed', async () => {
  const server = await startTestServer();

  try {
    for (let i = 0; i < 100; i += 1) {
      const response = await fetch(`${server.baseUrl}/api/tasks`, {
        headers: { 'x-user-id': 'admin-1' },
      });
      assert.equal(response.status, 200);
    }
  } finally {
    await server.close();
  }
});

test('AC-2: Exceeding rate limit returns 429', async () => {
  const server = await startTestServer();

  try {
    for (let i = 0; i < 100; i += 1) {
      const response = await fetch(`${server.baseUrl}/api/tasks`, {
        headers: { 'x-user-id': 'admin-1' },
      });
      assert.equal(response.status, 200);
    }

    const overResponse = await fetch(`${server.baseUrl}/api/tasks`, {
      headers: { 'x-user-id': 'admin-1' },
    });
    assert.equal(overResponse.status, 429);
    const body = await overResponse.json();
    assert.equal(body.error, 'Rate limit exceeded');
  } finally {
    await server.close();
  }
});

test('AC-3: Exactly rate limit value still succeeds', async () => {
  const server = await startTestServer();

  try {
    for (let i = 0; i < 100; i += 1) {
      const response = await fetch(`${server.baseUrl}/api/tasks`, {
        headers: { 'x-user-id': 'user-1' },
      });
      assert.equal(response.status, 200);
    }
  } finally {
    await server.close();
  }
});

test('AC-4: Rate limit service unavailable returns 503', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/tasks`, {
      headers: {
        'x-user-id': 'admin-1',
        'x-rate-limit-service-fail': 'true',
      },
    });

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'Service Unavailable');
  } finally {
    await server.close();
  }
});
