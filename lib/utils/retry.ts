import { logger } from '@/lib/logger';

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 500
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
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
