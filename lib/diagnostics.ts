import 'server-only';

const REDACT_KEYS_PATTERN = /(key|secret|token|password|authorization|cookie|database_url|neon_database_url)/i;

type LogLevel = 'info' | 'warn' | 'error';

type MetaRecord = Record<string, unknown>;

export function newErrorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  }
  return Math.random().toString(36).slice(2, 12);
}

export function redactMeta<T>(meta: T, parentKey?: string): T {
  if (parentKey && REDACT_KEYS_PATTERN.test(parentKey)) {
    return '[REDACTED]' as T;
  }

  if (Array.isArray(meta)) {
    return meta.map((item) => redactMeta(item)) as T;
  }

  if (meta && typeof meta === 'object') {
    const entries = Object.entries(meta as MetaRecord).map(([key, value]) => [key, redactMeta(value, key)]);
    return Object.fromEntries(entries) as T;
  }

  return meta;
}

function normalizeError(error: unknown): MetaRecord {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(typeof (error as Error & { code?: unknown }).code !== 'undefined'
        ? { code: (error as Error & { code?: unknown }).code }
        : {}),
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error',
  };
}

export function logEvent(level: LogLevel, event: string, meta: Record<string, unknown> = {}): void {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    meta: redactMeta(meta),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function toErrorMeta(error: unknown): MetaRecord {
  return redactMeta(normalizeError(error));
}
