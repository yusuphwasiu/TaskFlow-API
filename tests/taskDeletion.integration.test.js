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

test('Confirmation dialog appears for assigned task deletion', async () => {
  const app = await startTestServer({ taskStore: createTaskStore() });

  try {
    const response = await fetch(`${app.baseUrl}/tasks?asUser=user-1`);
    assert.equal(response.status, 200);

    const html = await response.text();
    assert.match(html, /window\.confirm\('Are you sure you want to delete this task\?'/);
    assert.match(html, /Delete/);
  } finally {
    await app.close();
  }
});

test('Successful task deletion after confirmation', async () => {
  const taskStore = createTaskStore();
  const app = await startTestServer({ taskStore });

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks/task-1`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.id, 'task-1');

    const tasksResponse = await fetch(`${app.baseUrl}/api/tasks`, {
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(tasksResponse.status, 200);
    const tasksBody = await tasksResponse.json();
    assert.equal(tasksBody.data.find((task) => task.id === 'task-1'), undefined);
  } finally {
    await app.close();
  }
});

test('Error message for unauthorized task deletion', async () => {
  const app = await startTestServer({ taskStore: createTaskStore() });

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks/task-2`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'You are not authorized to delete this task');
  } finally {
    await app.close();
  }
});

test('Retry mechanism for deletion with connectivity issues', async () => {
  const taskStore = createTaskStore(undefined, { transientDeleteFailures: 2 });
  const app = await startTestServer({ taskStore });

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks/task-1`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.id, 'task-1');
    assert.equal(taskStore.getDeleteAttemptCount(), 3);
  } finally {
    await app.close();
  }
});

test('Error handling for server error during deletion', async () => {
  const taskStore = createTaskStore(undefined, { shouldFailDeletePermanently: true });
  const app = await startTestServer({ taskStore });

  try {
    const response = await fetch(`${app.baseUrl}/api/tasks/task-1`, {
      method: 'DELETE',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, 'Deletion failed, please try again later');
  } finally {
    await app.close();
  }
});
