export type NodeEnvironment = 'development' | 'production' | 'test';

export interface PgSslConfig {
  rejectUnauthorized: true;
  ca?: string;
}

export interface ServerEnv {
  nodeEnv: NodeEnvironment;
  isProduction: boolean;
  port: number;
  appUrl: string | null;
  databaseUrl: string | null;
  migrationDatabaseUrl: string | null;
  databaseSslCaCert: string | null;
}

const VALID_NODE_ENVS: readonly NodeEnvironment[] = [
  'development',
  'production',
  'test',
];

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function validatePostgresUrl(rawUrl: string, varName: string): URL {
  const normalizedForUrlParse =
    /^postgres(?:ql)?:\/\/[^/]*@\/.+[?&]host=\//.test(rawUrl)
      ? rawUrl.replace('@/', '@localhost/')
      : rawUrl;

  let parsed: URL;
  try {
    parsed = new URL(normalizedForUrlParse);
  } catch {
    throw new Error(
      `Invalid ${varName}. Expected a valid postgres:// or postgresql:// connection URL.`
    );
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(
      `Invalid ${varName}. Connection scheme must be postgres:// or postgresql://.`
    );
  }

  const socketHost = parsed.searchParams.get('host');
  const isUnixSocket = Boolean(socketHost && socketHost.startsWith('/'));

  if (!parsed.hostname && !isUnixSocket) {
    throw new Error(
      `Invalid ${varName}. A database hostname or socket path is required.`
    );
  }

  if (parsed.port) {
    if (!/^\d+$/.test(parsed.port)) {
      throw new Error(`Invalid ${varName}. Port must be a valid integer.`);
    }
    const portNum = Number(parsed.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error(
        `Invalid ${varName}. Port must be an integer between 1 and 65535.`
      );
    }
  }

  const dbName = parsed.pathname.replace(/^\/+/, '');
  if (!dbName) {
    throw new Error(
      `Invalid ${varName}. A target database name is required in the URL path.`
    );
  }

  return parsed;
}

/**
 * Ensures migration connections do not use transaction-mode poolers
 * that break session-level advisory locks (`pg_advisory_lock`).
 */
export function assertMigrationSessionCompatibleUrl(rawUrl: string): void {
  const parsed = validatePostgresUrl(rawUrl, 'MIGRATION_DATABASE_URL');
  const pgBouncerParam = parsed.searchParams
    .get('pgbouncer')
    ?.trim()
    .toLowerCase();

  if (parsed.port === '6543' || pgBouncerParam === 'true') {
    throw new Error(
      'Invalid MIGRATION_DATABASE_URL. Transaction-mode poolers (port 6543 or pgbouncer=true) do not guarantee session affinity for pg_advisory_lock. Use a direct or session-mode connection (e.g., port 5432).'
    );
  }
}

/**
 * Resolves PostgreSQL TLS settings without ever disabling certificate verification.
 * Production TCP connections enforce verified TLS (`rejectUnauthorized: true`).
 */
export function buildPgSslConfig(options: {
  databaseUrl: string;
  isProduction: boolean;
  caCertPem?: string | null;
  varName?: string;
}): PgSslConfig | false {
  const varName = options.varName ?? 'DATABASE_URL';
  const parsed = validatePostgresUrl(options.databaseUrl, varName);
  const socketHost = parsed.searchParams.get('host');
  const isUnixSocket = Boolean(socketHost && socketHost.startsWith('/'));

  if (isUnixSocket) {
    return false;
  }

  const sslMode = parsed.searchParams.get('sslmode')?.trim().toLowerCase();
  const isLocalHost = LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase());
  const ca = options.caCertPem?.trim() || undefined;

  if (options.isProduction) {
    if (
      sslMode === 'disable' ||
      sslMode === 'allow' ||
      sslMode === 'prefer'
    ) {
      throw new Error(
        `Invalid ${varName} for production. Production TCP connections require verified TLS.`
      );
    }
    return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  }

  if (
    sslMode === 'require' ||
    sslMode === 'verify-ca' ||
    sslMode === 'verify-full' ||
    !isLocalHost
  ) {
    return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  }

  return false;
}

export function parseEnv(
  rawEnv: Readonly<Record<string, string | undefined>> = process.env
): ServerEnv {
  const rawNodeEnv = rawEnv.NODE_ENV?.trim();
  let nodeEnv: NodeEnvironment = 'development';

  if (rawNodeEnv) {
    if (!VALID_NODE_ENVS.includes(rawNodeEnv as NodeEnvironment)) {
      throw new Error(
        `Invalid NODE_ENV "${rawNodeEnv}". Expected one of: ${VALID_NODE_ENVS.join(', ')}.`
      );
    }
    nodeEnv = rawNodeEnv as NodeEnvironment;
  }

  const rawPort = rawEnv.PORT?.trim();
  let port = 3000;

  if (rawPort !== undefined && rawPort !== '') {
    if (!/^\d+$/.test(rawPort)) {
      throw new Error(
        `Invalid PORT "${rawPort}". Expected an integer between 1 and 65535.`
      );
    }
    const parsedPort = Number(rawPort);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      throw new Error(
        `Invalid PORT "${rawPort}". Expected an integer between 1 and 65535.`
      );
    }
    port = parsedPort;
  }

  const rawAppUrl = rawEnv.APP_URL?.trim();
  let appUrl: string | null = null;

  if (rawAppUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawAppUrl);
    } catch {
      throw new Error(
        'Invalid APP_URL. Expected a valid http or https URL when provided.'
      );
    }

    if (
      (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
      !parsedUrl.hostname
    ) {
      throw new Error(
        'Invalid APP_URL. Protocol must be http or https with a valid hostname.'
      );
    }

    appUrl = parsedUrl.toString().replace(/\/+$/, '');
  }

  const isProduction = nodeEnv === 'production';
  const databaseSslCaCert = rawEnv.DATABASE_SSL_CA_CERT?.trim() || null;

  const rawDatabaseUrl = rawEnv.DATABASE_URL?.trim();
  let databaseUrl: string | null = null;
  if (rawDatabaseUrl) {
    validatePostgresUrl(rawDatabaseUrl, 'DATABASE_URL');
    buildPgSslConfig({
      databaseUrl: rawDatabaseUrl,
      isProduction,
      caCertPem: databaseSslCaCert,
      varName: 'DATABASE_URL',
    });
    databaseUrl = rawDatabaseUrl;
  }

  const rawMigrationDatabaseUrl = rawEnv.MIGRATION_DATABASE_URL?.trim();
  let migrationDatabaseUrl: string | null = null;
  if (rawMigrationDatabaseUrl) {
    assertMigrationSessionCompatibleUrl(rawMigrationDatabaseUrl);
    buildPgSslConfig({
      databaseUrl: rawMigrationDatabaseUrl,
      isProduction,
      caCertPem: databaseSslCaCert,
      varName: 'MIGRATION_DATABASE_URL',
    });
    migrationDatabaseUrl = rawMigrationDatabaseUrl;
  }

  return {
    nodeEnv,
    isProduction,
    port,
    appUrl,
    databaseUrl,
    migrationDatabaseUrl,
    databaseSslCaCert,
  };
}
