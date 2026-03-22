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

test('AC-1: Valid request returns 200 with data', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/tasks`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert(body.data);
    assert(Array.isArray(body.data));
  } finally {
    await server.close();
  }
});

test('AC-2: Malformed JSON returns 400 with Bad Request', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'admin-1',
      },
      body: '{invalid json}',
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'Bad Request');
  } finally {
    await server.close();
  }
});

test('AC-3: Missing resource returns 404 with Not Found', async () => {
  const server = await startTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/nonexistent`, {
      headers: { 'x-user-id': 'admin-1' },
    });

    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error, 'Not Found');
  } finally {
    await server.close();
  }
});

test('AC-4: Service unavailable returns 503', async () => {
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
