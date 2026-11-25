export type NodeEnvironment = 'development' | 'production' | 'test';

export interface ServerEnv {
  nodeEnv: NodeEnvironment;
  isProduction: boolean;
  port: number;
  appUrl: string | null;
}

const VALID_NODE_ENVS: readonly NodeEnvironment[] = [
  'development',
  'production',
  'test',
];

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

  return {
    nodeEnv,
    isProduction,
    port,
    appUrl,
  };
}
