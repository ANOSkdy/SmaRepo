import { logger } from '@/lib/logger';

function isNonRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const nonRetryableNames = new Set([
    'ConfigEnvError',
    'DatabaseEnvError',
    'ValidationError',
  ]);
  if (nonRetryableNames.has(error.name)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    (message.includes('env') || message.includes('config') || message.includes('missing')) &&
    !message.includes('timeout')
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 500,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isNonRetryableError(error) || retries <= 0) {
      throw error;
    }
    logger.warn('withRetry retrying after error', {
      retriesLeft: retries,
      delay,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : error,
    });
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}
