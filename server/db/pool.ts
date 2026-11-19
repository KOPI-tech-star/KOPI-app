import { Pool, type PoolConfig } from 'pg';
import { buildPgSslConfig, type ServerEnv } from '../config/env';
import type { DatabaseHealthStatus } from '../types/api';

const DEFAULT_POOL_MAX = 10;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 3_000;
const DEFAULT_QUERY_TIMEOUT_MS = 5_000;
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 1_500;

let sharedPool: Pool | null = null;
let sharedPoolKey: string | null = null;

export function buildPoolConfig(env: ServerEnv): PoolConfig {
  if (!env.databaseUrl) {
    throw new Error('Cannot create PostgreSQL pool without DATABASE_URL.');
  }

  const ssl = buildPgSslConfig({
    databaseUrl: env.databaseUrl,
    isProduction: env.isProduction,
    caCertPem: env.databaseSslCaCert,
  });

  return {
    connectionString: env.databaseUrl,
    ssl,
    max: DEFAULT_POOL_MAX,
    idleTimeoutMillis: DEFAULT_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DEFAULT_CONNECTION_TIMEOUT_MS,
    query_timeout: DEFAULT_QUERY_TIMEOUT_MS,
    allowExitOnIdle: true,
  };
}

export function createManagedPool(env: ServerEnv): Pool {
  const pool = new Pool(buildPoolConfig(env));

  pool.on('error', (err) => {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code ?? 'UNKNOWN')
        : 'UNKNOWN';

    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'db_pool_idle_error',
        code,
      })
    );
  });

  return pool;
}

/**
 * Lazily returns the single managed pg.Pool for the server process.
 * Returns null when DATABASE_URL is not configured.
 */
export function getDatabasePool(env: ServerEnv): Pool | null {
  if (!env.databaseUrl) {
    return null;
  }

  const configKey = `${env.nodeEnv}:${env.databaseUrl}:${env.databaseSslCaCert ?? ''}`;
  if (sharedPool && sharedPoolKey === configKey) {
    return sharedPool;
  }

  if (sharedPool) {
    void sharedPool.end().catch(() => {});
  }

  sharedPool = createManagedPool(env);
  sharedPoolKey = configKey;
  return sharedPool;
}

export async function closeDatabasePool(): Promise<void> {
  if (!sharedPool) {
    return;
  }

  const poolToClose = sharedPool;
  sharedPool = null;
  sharedPoolKey = null;
  await poolToClose.end();
}

export async function checkDatabaseConnectivity(
  env: ServerEnv,
  timeoutMs: number = DEFAULT_HEALTH_CHECK_TIMEOUT_MS
): Promise<DatabaseHealthStatus> {
  const pool = getDatabasePool(env);
  if (!pool) {
    return 'not_configured';
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Database health check timed out.'));
        }, timeoutMs);
        timer.unref();
      }),
    ]);
    return 'connected';
  } catch {
    return 'unavailable';
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
