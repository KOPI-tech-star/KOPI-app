import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from './app';
import { parseEnv } from './config/env';
import { asyncHandler } from './middleware/errors';
import { sanitizePathForLog } from './middleware/requestLogger';

async function withServer(
  app: ReturnType<typeof createApp>,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('env validation: defaults to development on port 3000 without DB or Gemini keys', () => {
  const env = parseEnv({});
  assert.equal(env.nodeEnv, 'development');
  assert.equal(env.isProduction, false);
  assert.equal(env.port, 3000);
  assert.equal(env.appUrl, null);
});

test('env validation: accepts valid PORT, production NODE_ENV, and valid APP_URL', () => {
  const env = parseEnv({
    NODE_ENV: 'production',
    PORT: '8080',
    APP_URL: 'https://kopi.example.com/',
  });
  assert.equal(env.nodeEnv, 'production');
  assert.equal(env.isProduction, true);
  assert.equal(env.port, 8080);
  assert.equal(env.appUrl, 'https://kopi.example.com');
});

test('env validation: rejects invalid PORT values', () => {
  for (const invalidPort of ['0', '-1', '65536', '3000abc', 'abc', '3.14']) {
    assert.throws(
      () => parseEnv({ PORT: invalidPort }),
      /Invalid PORT/i,
      `Expected PORT="${invalidPort}" to fail validation`
    );
  }
});

test('env validation: rejects invalid NODE_ENV and invalid APP_URL', () => {
  assert.throws(() => parseEnv({ NODE_ENV: 'staging' }), /Invalid NODE_ENV/i);
  assert.throws(() => parseEnv({ APP_URL: 'not-a-url' }), /Invalid APP_URL/i);
  assert.throws(
    () => parseEnv({ APP_URL: 'ftp://kopi.example.com' }),
    /Invalid APP_URL/i
  );
});

test('sanitizePathForLog strips query parameters and control characters', () => {
  assert.equal(
    sanitizePathForLog('/api/health?token=secret&code=123#hash'),
    '/api/health'
  );
  assert.equal(sanitizePathForLog('/api/test\n\r?x=1'), '/api/test');
});

test('GET /api/health returns HTTP 200 with honest Firestore client vs server diagnostics and security headers', async () => {
  const env = parseEnv({ NODE_ENV: 'test' });
  const app = createApp({ env });

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    assert.ok(res.headers.get('x-request-id'));

    const rawText = await res.text();
    assert.doesNotMatch(rawText, /apiKey|AIza|private_key/i);

    const body = JSON.parse(rawText) as {
      data: {
        service: string;
        status: string;
        database: string;
        firestore: {
          provider: string;
          projectId: string | null;
          databaseId: string | null;
          clientSdkAccess: string;
          privilegedServerAccess: string;
        };
        timestamp: string;
      };
    };

    assert.equal(body.data.service, 'kopi-api');
    assert.equal(body.data.status, 'running');
    assert.equal(body.data.database, 'firestore_client_configured');
    assert.equal(body.data.firestore.provider, 'firebase_firestore');
    assert.equal(body.data.firestore.projectId, 'gen-lang-client-0653252950');
    assert.equal(
      body.data.firestore.databaseId,
      'ai-studio-kopi-6863852d-35ae-4115-97d3-3fcc2fdd6372'
    );
    assert.equal(body.data.firestore.clientSdkAccess, 'restricted_demo_get_only');
    assert.equal(body.data.firestore.privilegedServerAccess, 'unavailable');
    assert.ok(!Number.isNaN(Date.parse(body.data.timestamp)));
  });

  // Also verify unconfigured state when diagnostics report missing/invalid config
  const unconfiguredApp = createApp({
    env,
    checkFirestoreDiagnostics: async () => ({
      provider: 'firebase_firestore',
      projectId: null,
      databaseId: null,
      clientSdkAccess: 'unconfigured',
      privilegedServerAccess: 'unavailable',
    }),
  });

  await withServer(unconfiguredApp, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      data: { database: string; firestore: { clientSdkAccess: string; privilegedServerAccess: string } };
    };
    assert.equal(body.data.database, 'unconfigured');
    assert.equal(body.data.firestore.clientSdkAccess, 'unconfigured');
    assert.equal(body.data.firestore.privilegedServerAccess, 'unavailable');
  });
});

test('GET /api/nonexistent returns structured JSON 404 with requestId (never HTML)', async () => {
  const env = parseEnv({ NODE_ENV: 'test' });
  const app = createApp({ env });

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/nonexistent`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);

    const body = (await res.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.ok(body.error.message.length > 0);
    assert.ok(body.error.requestId.length > 0);
  });
});

test('unhandled async route error returns safe JSON 500 without leaking stack traces or internals', async () => {
  const env = parseEnv({ NODE_ENV: 'production' });
  const tempDist = fs.mkdtempSync(path.join(os.tmpdir(), 'kopi-dist-'));
  fs.writeFileSync(path.join(tempDist, 'index.html'), '<html><body>Kopi</body></html>');

  try {
    const app = createApp({
      env,
      distDir: tempDist,
      enableRequestLogging: false,
      enableErrorLogging: false,
      registerTestRoutes: (apiRouter) => {
        apiRouter.get(
          '/test-async-boom',
          asyncHandler(async () => {
            throw new Error('SECRET_DB_PASSWORD=/var/private/secret');
          })
        );
      },
    });

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/test-async-boom`);
      assert.equal(res.status, 500);
      const rawText = await res.text();
      assert.ok(!rawText.includes('SECRET_DB_PASSWORD'));
      assert.ok(!rawText.includes('/var/private/secret'));
      assert.ok(!rawText.includes('at '));

      const body = JSON.parse(rawText) as {
        error: { code: string; message: string; requestId: string };
      };
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.equal(body.error.message, 'An unexpected internal error occurred.');
      assert.ok(body.error.requestId.length > 0);
    });
  } finally {
    fs.rmSync(tempDist, { recursive: true, force: true });
  }
});

test('malformed JSON, unsupported media type, and oversized JSON bodies fail safely', async () => {
  const env = parseEnv({ NODE_ENV: 'test' });
  const app = createApp({
    env,
    registerTestRoutes: (apiRouter) => {
      apiRouter.post('/echo', (_req, res) => {
        res.status(200).json({ data: { ok: true } });
      });
    },
  });

  await withServer(app, async (baseUrl) => {
    const badJsonRes = await fetch(`${baseUrl}/api/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"broken": ',
    });
    assert.equal(badJsonRes.status, 400);
    const badJsonBody = (await badJsonRes.json()) as {
      error: { code: string; requestId: string };
    };
    assert.equal(badJsonBody.error.code, 'INVALID_JSON');
    assert.ok(badJsonBody.error.requestId);

    const wrongTypeRes = await fetch(`${baseUrl}/api/echo`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'plain text payload',
    });
    assert.equal(wrongTypeRes.status, 415);
    const wrongTypeBody = (await wrongTypeRes.json()) as {
      error: { code: string };
    };
    assert.equal(wrongTypeBody.error.code, 'UNSUPPORTED_MEDIA_TYPE');

    const oversizedPayload = JSON.stringify({ data: 'x'.repeat(80 * 1024) });
    const tooLargeRes = await fetch(`${baseUrl}/api/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: oversizedPayload,
    });
    assert.equal(tooLargeRes.status, 413);
    const tooLargeBody = (await tooLargeRes.json()) as {
      error: { code: string };
    };
    assert.equal(tooLargeBody.error.code, 'PAYLOAD_TOO_LARGE');
  });
});

test('production mode serves SPA HTML for deep links while keeping /api/nonexistent as JSON 404', async () => {
  const env = parseEnv({ NODE_ENV: 'production' });
  const tempDist = fs.mkdtempSync(path.join(os.tmpdir(), 'kopi-prod-'));
  fs.writeFileSync(
    path.join(tempDist, 'index.html'),
    '<!doctype html><html><body>Kopi SPA Shell</body></html>'
  );

  try {
    const app = createApp({
      env,
      distDir: tempDist,
      enableRequestLogging: false,
      enableErrorLogging: false,
    });

    await withServer(app, async (baseUrl) => {
      for (const route of [
        '/',
        '/opportunity-radar',
        '/problem-explorer',
        '/problem-explorer/wet-entrance-monsoons',
        '/opportunity-evaluation/wet-entrance-monsoons',
      ]) {
        const res = await fetch(`${baseUrl}${route}`);
        assert.equal(res.status, 200, `Expected 200 for ${route}`);
        const html = await res.text();
        assert.ok(html.includes('Kopi SPA Shell'));
      }

      const apiMissing = await fetch(`${baseUrl}/api/nonexistent`);
      assert.equal(apiMissing.status, 404);
      assert.match(apiMissing.headers.get('content-type') ?? '', /application\/json/);
    });
  } finally {
    fs.rmSync(tempDist, { recursive: true, force: true });
  }
});
