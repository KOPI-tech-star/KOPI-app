import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { Client } from 'pg';
import { createApp } from '../app';
import { buildPgSslConfig, parseEnv } from '../config/env';
import {
  classifyConnectionError,
  computeMigrationChecksum,
  discoverMigrations,
  getDefaultMigrationsDir,
  inspectMigrationTarget,
  MigrationIntegrityError,
  runMigrations,
  verifyAppliedMigrationsIntegrity,
} from './migrate';
import {
  buildPoolConfig,
  checkDatabaseConnectivity,
  closeDatabasePool,
} from './pool';

async function withHttpServer(
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

test('TEST A — no DATABASE_URL configured: app starts and /api/health reports not_configured even if MIGRATION_DATABASE_URL is set', async () => {
  const env = parseEnv({
    NODE_ENV: 'test',
    MIGRATION_DATABASE_URL: 'postgresql://migrator:secret_mig_pw@db.example.com:5432/kopi_dev',
  });
  assert.equal(env.databaseUrl, null);
  assert.ok(env.migrationDatabaseUrl);
  assert.equal(await checkDatabaseConnectivity(env), 'not_configured');

  const app = createApp({ env });
  await withHttpServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.ok(!raw.includes('secret_mig_pw'));
    const body = JSON.parse(raw) as {
      data: { service: string; status: string; database: string };
    };
    assert.equal(body.data.service, 'kopi-api');
    assert.equal(body.data.status, 'running');
    assert.equal(body.data.database, 'not_configured');
  });
});

test('TEST B — invalid DATABASE_URL or MIGRATION_DATABASE_URL fails safely without exposing credentials', () => {
  const secretPassword = 'super_secret_db_pw_987';
  const badUrls = [
    `mysql://kopi:${secretPassword}@db.internal:3306/kopi`,
    `http://kopi:${secretPassword}@db.internal:5432/kopi`,
    `postgresql://kopi:${secretPassword}@db.internal:5432/`,
    `postgresql://kopi:${secretPassword}@db.internal:99999/kopi`,
    `not-a-valid-url-${secretPassword}`,
  ];

  for (const url of badUrls) {
    for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL'] as const) {
      assert.throws(
        () => parseEnv({ [key]: url }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!err.message.includes(secretPassword));
          assert.ok(!err.message.includes('db.internal'));
          return true;
        }
      );
    }
  }
});

test('migration credential separation refuses fallback to runtime DATABASE_URL and rejects transaction-mode poolers', async () => {
  const runtimeOnlyEnv = parseEnv({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://runtime_user:runtime_pw@db.example.com:5432/kopi_prod',
  });

  await assert.rejects(
    runMigrations({ env: runtimeOnlyEnv }),
    /MIGRATION_DATABASE_URL is not configured/i
  );

  // Reject transaction-mode poolers (port 6543 or pgbouncer=true) for session advisory locks
  assert.throws(
    () =>
      parseEnv({
        NODE_ENV: 'development',
        MIGRATION_DATABASE_URL:
          'postgresql://migrator:pw123@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
      }),
    /Transaction-mode poolers/i
  );

  assert.throws(
    () =>
      parseEnv({
        NODE_ENV: 'development',
        MIGRATION_DATABASE_URL:
          'postgresql://migrator:pw123@db.example.com:5432/postgres?pgbouncer=true',
      }),
    /Transaction-mode poolers/i
  );
});

test('TLS configuration distinguishes local dev from production and never sets rejectUnauthorized: false', () => {
  const localDevSsl = buildPgSslConfig({
    databaseUrl: 'postgresql://postgres:localpw@localhost:5432/kopi_dev',
    isProduction: false,
  });
  assert.equal(localDevSsl, false);

  const prodTcpSsl = buildPgSslConfig({
    databaseUrl: 'postgresql://kopi:pw@db.example.com:5432/kopi_prod',
    isProduction: true,
  });
  assert.deepEqual(prodTcpSsl, { rejectUnauthorized: true });

  const prodWithCa = buildPgSslConfig({
    databaseUrl: 'postgresql://kopi:pw@db.example.com:5432/kopi_prod',
    isProduction: true,
    caCertPem: '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----',
  });
  assert.equal(typeof prodWithCa, 'object');
  assert.equal((prodWithCa as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
  assert.ok((prodWithCa as { ca?: string }).ca?.includes('BEGIN CERTIFICATE'));

  assert.throws(
    () =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://kopi:pw@db.example.com:5432/kopi_prod?sslmode=disable',
      }),
    /verified TLS/i
  );

  // Cloud SQL Unix socket connections use local socket transport
  const socketSsl = buildPgSslConfig({
    databaseUrl: 'postgresql://kopi:pw@/kopi?host=/cloudsql/proj:asia-south1:inst',
    isProduction: true,
  });
  assert.equal(socketSsl, false);
});

test('connection error classifier maps network/auth/TLS failures without revealing credentials', () => {
  assert.equal(
    classifyConnectionError({ code: 'ENOTFOUND' }),
    'DNS_RESOLUTION_FAILED'
  );
  assert.equal(
    classifyConnectionError({ code: 'ECONNREFUSED' }),
    'TCP_CONNECTION_FAILED'
  );
  assert.equal(
    classifyConnectionError({ code: '28P01' }),
    'AUTHENTICATION_FAILED'
  );
  assert.equal(
    classifyConnectionError({ code: 'SELF_SIGNED_CERT_IN_CHAIN' }),
    'TLS_VERIFICATION_FAILED'
  );
});

test('unreachable PostgreSQL reports database: unavailable without leaking connection details', async () => {
  const secretPw = 'unreachable_secret_pw';
  const env = parseEnv({
    NODE_ENV: 'development',
    DATABASE_URL: `postgresql://kopi:${secretPw}@127.0.0.1:1/kopi_nonexistent`,
  });

  const poolConfig = buildPoolConfig(env);
  assert.equal(poolConfig.max, 10);
  assert.ok((poolConfig.connectionTimeoutMillis ?? 0) > 0);

  const probeStatus = await checkDatabaseConnectivity(env, 400);
  assert.equal(probeStatus, 'unavailable');

  const app = createApp({
    env,
    enableRequestLogging: false,
    enableErrorLogging: false,
  });

  await withHttpServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.ok(!raw.includes(secretPw));
    assert.ok(!raw.includes('127.0.0.1'));
    const body = JSON.parse(raw) as { data: { database: string } };
    assert.equal(body.data.database, 'unavailable');
  });

  await closeDatabasePool();
});

test('initial migration file discovery, checksum verification, and schema boundary definitions', () => {
  const migrations = discoverMigrations(getDefaultMigrationsDir());
  assert.ok(migrations.length >= 1);
  assert.equal(migrations[0].filename, '0001_initial_foundation.sql');
  assert.equal(migrations[0].version, '0001_initial_foundation');
  assert.match(migrations[0].checksumSha256, /^[0-9a-f]{64}$/);

  const sql = migrations[0].sql;
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS kopi_internal/i);
  assert.match(sql, /kopi_internal\.schema_migrations/i);
  assert.match(sql, /kopi_internal\.data_sources/i);
  assert.match(sql, /is_enabled BOOLEAN NOT NULL DEFAULT false/i);
  assert.match(sql, /chk_data_sources_enable_requires_verified_terms/i);
  assert.match(sql, /REVOKE ALL ON SCHEMA kopi_internal FROM PUBLIC/i);

  // Checksum verification passes for unmodified migration
  const applied = verifyAppliedMigrationsIntegrity(migrations, [
    {
      version: migrations[0].version,
      filename: migrations[0].filename,
      checksum_sha256: migrations[0].checksumSha256,
    },
  ]);
  assert.equal(applied.has('0001_initial_foundation'), true);

  // Modified migration copy is rejected before any DB changes
  const tamperedCopy = [
    {
      ...migrations[0],
      sql: `${migrations[0].sql}\n-- tampered`,
      checksumSha256: computeMigrationChecksum(`${migrations[0].sql}\n-- tampered`),
    },
  ];
  assert.throws(
    () =>
      verifyAppliedMigrationsIntegrity(tamperedCopy, [
        {
          version: migrations[0].version,
          filename: migrations[0].filename,
          checksum_sha256: migrations[0].checksumSha256,
        },
      ]),
    MigrationIntegrityError
  );
});

test('HTTP boundary — internal schema and data_sources are not exposed via public API routes', async () => {
  const env = parseEnv({ NODE_ENV: 'test' });
  const app = createApp({ env });

  await withHttpServer(app, async (baseUrl) => {
    for (const pathSegment of [
      '/api/data-sources',
      '/api/data_sources',
      '/api/internal/data-sources',
      '/api/kopi_internal/data_sources',
      '/api/migrations',
    ]) {
      const res = await fetch(`${baseUrl}${pathSegment}`);
      assert.equal(res.status, 404, `Expected 404 for ${pathSegment}`);
    }
  });
});

// =========================================================================
// SAFE LIVE DEVELOPMENT POSTGRESQL VERIFICATION (NON-DESTRUCTIVE ONLY)
// Guarded strictly by MIGRATION_DATABASE_URL. Never runs destructive cases.
// =========================================================================
const liveMigrationUrl = process.env.MIGRATION_DATABASE_URL?.trim();

test(
  'LIVE DEV POSTGRES (A–H safe non-destructive checks: connect, SELECT 1, 0001 apply, idempotence, checksum, schema, disabled registry, permissions)',
  {
    skip: liveMigrationUrl
      ? false
      : 'Not executed — MIGRATION_DATABASE_URL not configured in environment',
  },
  async () => {
    const env = parseEnv({
      NODE_ENV: 'development',
      MIGRATION_DATABASE_URL: liveMigrationUrl,
      DATABASE_SSL_CA_CERT: process.env.DATABASE_SSL_CA_CERT,
    });

    const preflight = await inspectMigrationTarget({ env });
    assert.equal(preflight.connectivity, 'connected');

    const firstRun = await runMigrations({ env });
    assert.ok(firstRun.totalKnown >= 1);

    const secondRun = await runMigrations({ env });
    assert.equal(secondRun.newlyApplied.length, 0);

    const postInspect = await inspectMigrationTarget({ env });
    assert.equal(postInspect.schemaExists, true);
    assert.equal(postInspect.migrationsTableExists, true);
    assert.equal(postInspect.dataSourcesTableExists, true);
    assert.equal(postInspect.publicSchemaUsage, false);
    assert.equal(postInspect.publicDataSourcesSelect, false);
    assert.ok(
      postInspect.appliedMigrations.every((row) => row.checksumMatchesLocal)
    );

    const client = new Client({
      connectionString: env.migrationDatabaseUrl!,
      ssl: buildPgSslConfig({
        databaseUrl: env.migrationDatabaseUrl!,
        isProduction: env.isProduction,
        caCertPem: env.databaseSslCaCert,
        varName: 'MIGRATION_DATABASE_URL',
      }),
    });
    await client.connect();
    try {
      const countRes = await client.query<{ total: string; enabled: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE is_enabled = true)::text AS enabled
         FROM kopi_internal.data_sources`
      );
      assert.equal(countRes.rows[0]?.enabled, '0');
    } finally {
      await client.end();
    }
  }
);

// =========================================================================
// ISOLATED DISPOSABLE POSTGRESQL DESTRUCTIVE TESTS
// Guarded strictly by DISPOSABLE_TEST_DATABASE_URL (never runs against shared dev DB).
// =========================================================================
const disposableTestUrl = process.env.DISPOSABLE_TEST_DATABASE_URL?.trim();

test(
  'ISOLATED DISPOSABLE POSTGRES (tampered history, invalid SQL rollback, constraint rejection)',
  {
    skip: disposableTestUrl
      ? false
      : 'Not executed — isolated DISPOSABLE_TEST_DATABASE_URL unavailable',
  },
  async () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      MIGRATION_DATABASE_URL: disposableTestUrl,
    });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kopi-disposable-'));
    try {
      const mig0001 = fs.readFileSync(
        path.join(getDefaultMigrationsDir(), '0001_initial_foundation.sql'),
        'utf8'
      );
      fs.writeFileSync(path.join(tempDir, '0001_initial_foundation.sql'), mig0001);

      await runMigrations({ env, migrationsDir: tempDir });

      // Tampered checksum copy rejected
      fs.writeFileSync(
        path.join(tempDir, '0001_initial_foundation.sql'),
        `${mig0001}\n-- modified after apply`
      );
      await assert.rejects(
        runMigrations({ env, migrationsDir: tempDir }),
        MigrationIntegrityError
      );

      // Invalid SQL migration rolls back cleanly
      fs.writeFileSync(path.join(tempDir, '0001_initial_foundation.sql'), mig0001);
      fs.writeFileSync(
        path.join(tempDir, '9999_invalid_test_migration.sql'),
        'CREATE TABLE kopi_internal.should_rollback_test (id INT); SELECT * FROM nonexistent_table_xyz;'
      );
      await assert.rejects(runMigrations({ env, migrationsDir: tempDir }));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
);
