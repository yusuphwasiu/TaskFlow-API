import test from 'node:test';
import { createApp } from '../src/app.js';
import { createRateLimitService } from '../src/services/rateLimitService.js';
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
  // Use a shorter window for testing (100 requests per 100ms instead of per hour)
  const testRateLimitService = createRateLimitService({
    maxRequestsPerHour: 100,
    windowMs: 100, // 100ms window for testing
  });
  const server = await startTestServer({ rateLimitService: testRateLimitService });

  try {
    for (let i = 0; i < 99; i += 1) {
      const response = await fetch(`${server.baseUrl}/api/checkout`, {
        method: 'POST',
        headers: { 'x-user-id': 'admin-1' },
      });
      assert.equal(response.status, 200);
    }
  } finally {
    await server.close();
  }
});

test('AC-2: Exceeding rate limit returns 429', async () => {
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
        headers: { 'x-user-id': 'admin-1' },
      });
      assert.equal(response.status, 200);
    }

    const overResponse = await fetch(`${server.baseUrl}/api/checkout`, {
      method: 'POST',
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
  } finally {
    await server.close();
  }
});

test('AC-3: Independent rate limiting for multiple users', async () => {
  // Use a shorter window for testing
  const testRateLimitService = createRateLimitService({
    maxRequestsPerHour: 5,
    windowMs: 100, // 100ms window for testing
  });
  const server = await startTestServer({ rateLimitService: testRateLimitService });

  try {
    // User 1 makes 5 requests (at limit)
    for (let i = 0; i < 5; i += 1) {
      const response = await fetch(`${server.baseUrl}/api/checkout`, {
        method: 'POST',
        headers: { 'x-user-id': 'admin-1' },
      });
      assert.equal(response.status, 200);
    }

    // User 1 should be rate limited
    const user1OverResponse = await fetch(`${server.baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'x-user-id': 'admin-1' },
    });
    assert.equal(user1OverResponse.status, 429);

    // User 2 should still be able to make requests (independent limit)
    for (let i = 0; i < 5; i += 1) {
      const response = await fetch(`${server.baseUrl}/api/checkout`, {
        method: 'POST',
        headers: { 'x-user-id': 'viewer-1' },
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
    const response = await fetch(`${server.baseUrl}/api/checkout`, {
      method: 'POST',
      headers: {
        'x-user-id': 'admin-1',
        'x-rate-limit-service-fail': 'true',
      },
    });

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'Service unavailable');
  } finally {
    await server.close();
  }
});

test('Rate limit reset after window expires', async () => {
  // Use a very short window for testing
  const testRateLimitService = createRateLimitService({
    maxRequestsPerHour: 5,
    windowMs: 50, // 50ms window for testing
  });
  const server = await startTestServer({ rateLimitService: testRateLimitService });

  try {
    // Make 5 requests to hit the limit
    for (let i = 0; i < 5; i += 1) {
      const response = await fetch(`${server.baseUrl}/api/checkout`, {
        method: 'POST',
        headers: { 'x-user-id': 'user-1' },
      });
      assert.equal(response.status, 200);
    }

    // Should be rate limited
    const overResponse = await fetch(`${server.baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'x-user-id': 'user-1' },
    });
    assert.equal(overResponse.status, 429);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 60));

    // Should be able to make requests again
    const response = await fetch(`${server.baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'x-user-id': 'user-1' },
    });
    assert.equal(response.status, 200);
  } finally {
    await server.close();
  }
});

test('Retry on network error', async () => {
  // Create a rate limit service that fails on first attempt but succeeds on retry
  let attemptCount = 0;
  const testRateLimitService = {
    checkRequest(request) {
      attemptCount += 1;
      if (attemptCount === 1) {
        throw new Error('ECONNRESET: Connection reset by peer');
      }
      return { allowed: true, userId: 'user-1', count: 1, limit: 100 };
    },
  };

  const events = [];
  const logger = {
    warn(message, metadata) {
      events.push({ type: 'warn', message, metadata });
    },
  };

  const server = await startTestServer({
    rateLimitService: testRateLimitService,
    logger,
    retryAttempts: 3,
    retryDelayMs: 10,
  });

  try {
    const response = await fetch(`${server.baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'x-user-id': 'user-1' },
    });
    assert.equal(response.status, 200);
    assert.equal(attemptCount, 2); // Should have retried once
    assert.equal(events.some(e => e.message === 'Retrying rate limit check'), true);
  } finally {
    await server.close();
  }
});
