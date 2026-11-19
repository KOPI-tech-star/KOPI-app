import 'dotenv/config';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import {
  assertMigrationSessionCompatibleUrl,
  buildPgSslConfig,
  parseEnv,
  type ServerEnv,
} from '../config/env';

const MIGRATION_ADVISORY_LOCK_KEY = 749_201_831;
const MIGRATION_FILENAME_PATTERN = /^(\d{4}_[a-z0-9_]+)\.sql$/;

export interface DiscoveredMigration {
  version: string;
  filename: string;
  sql: string;
  checksumSha256: string;
}

export interface AppliedMigrationRecord {
  version: string;
  filename: string;
  checksum_sha256: string;
}

export interface MigrationRunResult {
  alreadyApplied: string[];
  newlyApplied: string[];
  totalKnown: number;
}

export interface TargetInspectionResult {
  connectivity: 'connected';
  tlsActive: boolean | null;
  schemaExists: boolean;
  migrationsTableExists: boolean;
  dataSourcesTableExists: boolean;
  appliedMigrations: Array<{
    version: string;
    filename: string;
    checksumMatchesLocal: boolean;
    appliedAt: string;
  }>;
  publicSchemaUsage: boolean | null;
  publicDataSourcesSelect: boolean | null;
}

export class MigrationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationIntegrityError';
  }
}

export function computeMigrationChecksum(sql: string): string {
  const normalized = sql.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function getDefaultMigrationsDir(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(currentDir, 'migrations');
}

export function discoverMigrations(
  migrationsDir: string = getDefaultMigrationsDir()
): DiscoveredMigration[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`);
  }

  const entries = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const seenVersions = new Set<string>();
  const migrations: DiscoveredMigration[] = [];

  for (const filename of entries) {
    const match = MIGRATION_FILENAME_PATTERN.exec(filename);
    if (!match) {
      throw new MigrationIntegrityError(
        `Invalid migration filename "${filename}". Expected NNNN_description.sql.`
      );
    }

    const version = match[1];
    if (seenVersions.has(version)) {
      throw new MigrationIntegrityError(
        `Duplicate migration version detected: "${version}".`
      );
    }
    seenVersions.add(version);

    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    if (!sql.trim()) {
      throw new MigrationIntegrityError(
        `Migration file "${filename}" must not be empty.`
      );
    }

    migrations.push({
      version,
      filename,
      sql,
      checksumSha256: computeMigrationChecksum(sql),
    });
  }

  return migrations;
}

export function verifyAppliedMigrationsIntegrity(
  discovered: readonly DiscoveredMigration[],
  applied: readonly AppliedMigrationRecord[]
): Set<string> {
  const discoveredByVersion = new Map(
    discovered.map((migration) => [migration.version, migration])
  );
  const appliedVersions = new Set<string>();

  for (const row of applied) {
    const localMigration = discoveredByVersion.get(row.version);
    if (!localMigration) {
      throw new MigrationIntegrityError(
        `Applied migration "${row.version}" (${row.filename}) is missing from the local migrations directory.`
      );
    }

    if (localMigration.filename !== row.filename) {
      throw new MigrationIntegrityError(
        `Migration filename mismatch for "${row.version}": expected "${row.filename}", found "${localMigration.filename}".`
      );
    }

    if (localMigration.checksumSha256 !== row.checksum_sha256) {
      throw new MigrationIntegrityError(
        `Checksum mismatch for already-applied migration "${row.version}". Refusing to modify or continue.`
      );
    }

    appliedVersions.add(row.version);
  }

  return appliedVersions;
}

export function classifyConnectionError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'CONNECTION_FAILED';
  const code = 'code' in err ? String((err as { code?: unknown }).code ?? '') : '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS_RESOLUTION_FAILED';
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EHOSTUNREACH') {
    return 'TCP_CONNECTION_FAILED';
  }
  if (code === '28P01' || code === '28000') return 'AUTHENTICATION_FAILED';
  if (
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
  ) {
    return 'TLS_VERIFICATION_FAILED';
  }
  if (code === '3D000') return 'DATABASE_NOT_FOUND';
  return code ? `POSTGRES_ERROR_${code}` : 'CONNECTION_FAILED';
}

function createMigrationClient(env: ServerEnv): Client {
  if (!env.migrationDatabaseUrl) {
    throw new Error(
      'Cannot execute database migration operations because MIGRATION_DATABASE_URL is not configured. Refusing to fall back to runtime DATABASE_URL.'
    );
  }

  assertMigrationSessionCompatibleUrl(env.migrationDatabaseUrl);

  const ssl = buildPgSslConfig({
    databaseUrl: env.migrationDatabaseUrl,
    isProduction: env.isProduction,
    caCertPem: env.databaseSslCaCert,
    varName: 'MIGRATION_DATABASE_URL',
  });

  return new Client({
    connectionString: env.migrationDatabaseUrl,
    ssl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 30_000,
  });
}

/**
 * Non-destructive preflight inspection of the configured MIGRATION_DATABASE_URL
 * target: verifies connectivity, TLS status, existing kopi_internal objects,
 * migration checksum match, and PUBLIC permission boundaries without mutating data.
 */
export async function inspectMigrationTarget(options: {
  env: ServerEnv;
  migrationsDir?: string;
}): Promise<TargetInspectionResult> {
  const { env, migrationsDir = getDefaultMigrationsDir() } = options;
  const discovered = discoverMigrations(migrationsDir);
  const discoveredByVersion = new Map(
    discovered.map((migration) => [migration.version, migration])
  );

  const client = createMigrationClient(env);

  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Migration target connection failed (${classifyConnectionError(err)}).`
    );
  }

  try {
    await client.query('SELECT 1');

    let tlsActive: boolean | null = null;
    try {
      const sslRes = await client.query<{ ssl: string }>('SHOW ssl');
      tlsActive = sslRes.rows[0]?.ssl === 'on';
    } catch {
      tlsActive = null;
    }

    const schemaRes = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.schemata WHERE schema_name = 'kopi_internal'
       ) AS exists`
    );
    const schemaExists = Boolean(schemaRes.rows[0]?.exists);

    const tablesRes = await client.query<{
      migrations_exists: boolean;
      data_sources_exists: boolean;
    }>(
      `SELECT
         to_regclass('kopi_internal.schema_migrations') IS NOT NULL AS migrations_exists,
         to_regclass('kopi_internal.data_sources') IS NOT NULL AS data_sources_exists`
    );
    const migrationsTableExists = Boolean(tablesRes.rows[0]?.migrations_exists);
    const dataSourcesTableExists = Boolean(tablesRes.rows[0]?.data_sources_exists);

    const appliedMigrations: TargetInspectionResult['appliedMigrations'] = [];
    if (migrationsTableExists) {
      const histRes = await client.query<{
        version: string;
        filename: string;
        checksum_sha256: string;
        applied_at: Date;
      }>(
        'SELECT version, filename, checksum_sha256, applied_at FROM kopi_internal.schema_migrations ORDER BY version ASC'
      );
      for (const row of histRes.rows) {
        const local = discoveredByVersion.get(row.version);
        appliedMigrations.push({
          version: row.version,
          filename: row.filename,
          checksumMatchesLocal: Boolean(
            local &&
              local.filename === row.filename &&
              local.checksumSha256 === row.checksum_sha256
          ),
          appliedAt: new Date(row.applied_at).toISOString(),
        });
      }
    }

    let publicSchemaUsage: boolean | null = null;
    let publicDataSourcesSelect: boolean | null = null;
    if (schemaExists) {
      const privRes = await client.query<{
        public_usage: boolean;
        public_select: boolean | null;
      }>(
        `SELECT
           has_schema_privilege('PUBLIC', 'kopi_internal', 'USAGE') AS public_usage,
           CASE
             WHEN to_regclass('kopi_internal.data_sources') IS NOT NULL
             THEN has_table_privilege('PUBLIC', 'kopi_internal.data_sources', 'SELECT')
             ELSE NULL
           END AS public_select`
      );
      publicSchemaUsage = Boolean(privRes.rows[0]?.public_usage);
      publicDataSourcesSelect = privRes.rows[0]?.public_select ?? null;
    }

    return {
      connectivity: 'connected',
      tlsActive,
      schemaExists,
      migrationsTableExists,
      dataSourcesTableExists,
      appliedMigrations,
      publicSchemaUsage,
      publicDataSourcesSelect,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function runMigrations(options: {
  env: ServerEnv;
  migrationsDir?: string;
}): Promise<MigrationRunResult> {
  const { env, migrationsDir = getDefaultMigrationsDir() } = options;
  const discovered = discoverMigrations(migrationsDir);
  const client = createMigrationClient(env);

  let lockAcquired = false;
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Migration database connection failed (${classifyConnectionError(err)}).`
    );
  }

  try {
    await client.query('SELECT pg_advisory_lock($1)', [
      MIGRATION_ADVISORY_LOCK_KEY,
    ]);
    lockAcquired = true;

    await client.query('CREATE SCHEMA IF NOT EXISTS kopi_internal');
    await client.query(`
      CREATE TABLE IF NOT EXISTS kopi_internal.schema_migrations (
        version TEXT PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        checksum_sha256 CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_schema_migrations_version_nonempty CHECK (btrim(version) <> ''),
        CONSTRAINT chk_schema_migrations_checksum_hex CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
      )
    `);

    const appliedRes = await client.query<AppliedMigrationRecord>(
      'SELECT version, filename, checksum_sha256 FROM kopi_internal.schema_migrations ORDER BY version ASC'
    );

    const appliedVersions = verifyAppliedMigrationsIntegrity(
      discovered,
      appliedRes.rows
    );

    const alreadyApplied: string[] = [];
    const newlyApplied: string[] = [];

    for (const migration of discovered) {
      if (appliedVersions.has(migration.version)) {
        alreadyApplied.push(migration.version);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO kopi_internal.schema_migrations (version, filename, checksum_sha256)
           VALUES ($1, $2, $3)`,
          [migration.version, migration.filename, migration.checksumSha256]
        );
        await client.query('COMMIT');
        newlyApplied.push(migration.version);
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve original migration failure error.
        }
        const message =
          err instanceof Error ? err.message : 'Unknown migration SQL error';
        throw new Error(
          `Migration "${migration.filename}" failed and was rolled back: ${message}`
        );
      }
    }

    return {
      alreadyApplied,
      newlyApplied,
      totalKnown: discovered.length,
    };
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [
          MIGRATION_ADVISORY_LOCK_KEY,
        ]);
      } catch {
        // Connection teardown will also release session-level advisory locks.
      }
    }
    await client.end().catch(() => {});
  }
}

async function runCli(): Promise<void> {
  const mode = process.argv.includes('--inspect') ? 'inspect' : 'migrate';
  const env = parseEnv(process.env);

  if (mode === 'inspect') {
    const summary = await inspectMigrationTarget({ env });
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        event: 'db_target_inspected',
        ...summary,
      })
    );
    return;
  }

  const result = await runMigrations({ env });
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'db_migrations_completed',
      alreadyAppliedCount: result.alreadyApplied.length,
      newlyAppliedCount: result.newlyApplied.length,
      newlyApplied: result.newlyApplied,
      totalKnown: result.totalKnown,
    })
  );
}

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runCli().catch((err) => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'db_migrations_failed',
        message: err instanceof Error ? err.message : 'Unknown migration error',
      })
    );
    process.exit(1);
  });
}
