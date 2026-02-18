import 'server-only';

const SECRET_KEY_PATTERN = /(key|secret|token|password|authorization|cookie|database_url|neon_database_url)/i;

type LogLevel = 'info' | 'warn' | 'error';

type LogMeta = Record<string, unknown>;

type LoggerOptions = {
  requestId?: string;
};

function createShortRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

function normalizeError(error: Error): LogMeta {
  return {
    name: error.name,
    message: error.message,
  };
}

export function redactSecrets(value: unknown, parentKey?: string): unknown {
  if (parentKey && SECRET_KEY_PATTERN.test(parentKey)) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, redactSecrets(nestedValue, key)]),
    );
  }

  return value;
}

export function getRequestCorrelationId(headers: Headers): string {
  const incoming = headers.get('x-request-id')?.trim();
  return incoming && incoming.length > 0 ? incoming : createShortRequestId();
}

function writeLog(level: LogLevel, event: string, meta?: unknown, options?: LoggerOptions): void {
  const payload = {
    level,
    event,
    requestId: options?.requestId ?? createShortRequestId(),
    timestamp: new Date().toISOString(),
    meta: redactSecrets(meta ?? {}),
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

export function logInfo(event: string, meta?: unknown, options?: LoggerOptions): void {
  writeLog('info', event, meta, options);
}

export function logWarn(event: string, meta?: unknown, options?: LoggerOptions): void {
  writeLog('warn', event, meta, options);
}

export function logError(event: string, error?: unknown, options?: LoggerOptions): void {
  const meta = error instanceof Error ? normalizeError(error) : error;
  writeLog('error', event, meta, options);
}

export function createRequestLogger(request: Request) {
  const requestId = getRequestCorrelationId(request.headers);

  return {
    requestId,
    info: (event: string, meta?: unknown) => logInfo(event, meta, { requestId }),
    warn: (event: string, meta?: unknown) => logWarn(event, meta, { requestId }),
    error: (event: string, error?: unknown) => logError(event, error, { requestId }),
  };
}

export const logger = {
  info: (event: string, data?: unknown) => {
    logInfo(event, data);
  },
  warn: (event: string, data?: unknown) => {
    logWarn(event, data);
  },
  error: (event: string, error: unknown) => {
    logError(event, error);
  },
};
