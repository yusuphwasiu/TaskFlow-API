import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

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

test('Client Error - 4xx Status Code (unsupported media type)', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'x-user-id': 'user-1',
      },
      body: 'plain text',
    });

    assert(response.status >= 400 && response.status < 500);
    const body = await response.json();
    assert.equal(response.status, 415);
    assert.equal(body.error, 'Unsupported media type');
  } finally {
    await app.close();
  }
});

test('Server Error - 5xx Status Code', async () => {
  // Mock taskStore that throws on createTask
  const failingTaskStore = {
    getAllTasksForUser() { return []; },
    getTaskById() { return null; },
    createTask() { throw new Error('database down'); },
    deleteTask() { return { error: 'not implemented' }; },
  };

  const app = await startTestServer({ taskStore: failingTaskStore });

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'user-1',
      },
      body: JSON.stringify({ title: 'Will fail' }),
    });

    assert(response.status >= 500 && response.status < 600);
    const body = await response.json();
    assert.equal(body.standard, 'Internal server error');
  } finally {
    await app.close();
  }
});

test('Authentication Error - 401 Status Code', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, 'Authentication required');
  } finally {
    await app.close();
  }
});

test('Service Unavailable - 503 Status Code', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/simulate/unavailable`);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'Service unavailable');
  } finally {
    await app.close();
  }
});

test('Invalid HTTP Method - 405 Status Code', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks`, { method: 'PUT', headers: { 'x-user-id': 'user-1' } });
    assert.equal(response.status, 405);
    const body = await response.json();
    assert.equal(body.error, 'Method not allowed');
  } finally {
    await app.close();
  }
});

test('Request Timeout - 408 Status Code', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/simulate/timeout`);
    assert.equal(response.status, 408);
    const body = await response.json();
    // our simulation uses 'Request timed out' detail
    assert.ok(typeof body.error === 'string');
  } finally {
    await app.close();
  }
});
