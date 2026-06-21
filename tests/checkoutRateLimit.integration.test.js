import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRateLimitService } from '../src/services/rateLimitService.js';

async function startTestServer(dependencies = {}) {
  const app = createApp(dependencies);

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

test('AC-1: Checkout requests within limit are processed successfully', async () => {
  // Use a shorter window for testing
  const testRateLimitService = createRateLimitService({
    maxRequestsPerHour: 100,
    windowMs: 100, // 100ms window for testing
  });
  const server = await startTestServer({ rateLimitService: testRateLimitService });

  try {
    for (let i = 0; i < 99; i += 1) {
      const response = await fetch(`${server.baseUrl}/api/checkout`, {
        method: 'POST',
        headers: { 'x-user-id': 'user-1' },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.data.userId, 'user-1');
    }
  } finally {
    await server.close();
  }
});

test('AC-2: Exceeding the checkout rate limit returns 429', async () => {
  // Use a shorter window for testing
  const testRateLimitService = createRateLimitService({
    maxRequestsPerHour: 100,
    windowMs: 100, // 100ms window for testing
  });
  const server = await startTestServer({ rateLimitService: testRateLimitService });

  try {
    for (let i = 0; i < 100; i += 1) {
      const response = await fetch(`${server.baseUrl}/api/checkout`, {
        method: 'POST',
        headers: { 'x-user-id': 'user-1' },
      });
      assert.equal(response.status, 200);
    }

    const overResponse = await fetch(`${server.baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(overResponse.status, 429);
    const body = await overResponse.json();
    assert.equal(body.error, 'Rate limit exceeded');
  } finally {
    await server.close();
  }
});

test('AC-3: Multiple users are rate limited independently', async () => {
  // Use a shorter window for testing
  const testRateLimitService = createRateLimitService({
    maxRequestsPerHour: 100,
    windowMs: 100, // 100ms window for testing
  });
  const server = await startTestServer({ rateLimitService: testRateLimitService });

  try {
    for (let i = 0; i < 100; i += 1) {
      const responseA = await fetch(`${server.baseUrl}/api/checkout`, {
        method: 'POST',
        headers: { 'x-user-id': 'user-1' },
      });
      const responseB = await fetch(`${server.baseUrl}/api/checkout`, {
        method: 'POST',
        headers: { 'x-user-id': 'viewer-1' },
      });
      assert.equal(responseA.status, 200);
      assert.equal(responseB.status, 200);
    }

    const overResponseA = await fetch(`${server.baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'x-user-id': 'user-1' },
    });
    const overResponseB = await fetch(`${server.baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'x-user-id': 'viewer-1' },
    });

    assert.equal(overResponseA.status, 429);
    assert.equal(overResponseB.status, 429);
  } finally {
    await server.close();
  }
});

test('AC-4: Rate limit breach logs incident and alerts admin', async () => {
  // Use a shorter window for testing
  const testRateLimitService = createRateLimitService({
    maxRequestsPerHour: 100,
    windowMs: 100, // 100ms window for testing
  });
  const events = [];
  const logger = {
    warn(message, metadata) {
      events.push({ type: 'warn', message, metadata });
    },
  };
  const alertAdmin = ({ userId, count, limit }) => {
    events.push({ type: 'alert', userId, count, limit });
  };

  const server = await startTestServer({ rateLimitService: testRateLimitService, logger, alertAdmin });

  try {
    for (let i = 0; i < 100; i += 1) {
      const response = await fetch(`${server.baseUrl}/api/checkout`, {
        method: 'POST',
        headers: { 'x-user-id': 'user-1' },
      });
      assert.equal(response.status, 200);
    }

    const overResponse = await fetch(`${server.baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'x-user-id': 'user-1' },
    });

    assert.equal(overResponse.status, 429);
    assert.equal(events.some((event) => event.type === 'warn' && event.message === 'Rate limit exceeded'), true);
    assert.equal(events.some((event) => event.type === 'alert' && event.userId === 'user-1' && event.limit === 100), true);
  } finally {
    await server.close();
  }
});
