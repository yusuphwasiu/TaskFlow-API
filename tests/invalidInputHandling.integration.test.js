import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createTaskStore } from '../src/services/taskStore.js';

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

test('Successful Task Creation with Valid Data', async () => {
  const app = await startTestServer({ taskStore: createTaskStore() });

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'user-1',
      },
      body: JSON.stringify({ title: 'New Task' }),
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.ok(body.data.id);
    assert.equal(body.data.title, 'New Task');
    assert.equal(body.data.assignedTo, 'user-1');
  } finally {
    await app.close();
  }
});

test('Handle Invalid Task ID', async () => {
  const app = await startTestServer({ taskStore: createTaskStore() });

  try {
    // Try to delete a task with an invalid ID (contains special characters)
    const response = await fetch(`${app.baseUrl}/api/tasks/invalid@#$%`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'Invalid task ID');
  } finally {
    await app.close();
  }
});

test('Handle Nonexistent Task ID', async () => {
  const app = await startTestServer({ taskStore: createTaskStore() });

  try {
    // Try to delete a task that doesn't exist (but with valid ID format)
    const response = await fetch(`${app.baseUrl}/api/tasks/nonexistent-task`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(response.status, 404);
    const body = await response.json();
    assert.ok(body.error);
  } finally {
    await app.close();
  }
});

test('Handle Malformed JSON', async () => {
  const app = await startTestServer();

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'user-1',
      },
      body: '{ invalid json',
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'Malformed JSON');
  } finally {
    await app.close();
  }
});
