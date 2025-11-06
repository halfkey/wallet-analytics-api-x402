import { logger } from './logger.js';

export class RPCError extends Error {
  public override readonly cause?: unknown;
  public readonly retryable: boolean;

  constructor(
    message: string,
    cause?: unknown,
    retryable: boolean = false
  ) {
    super(message);
    this.name = 'RPCError';
    this.cause = cause;
    this.retryable = retryable;
  }
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};

/**
 * Retry an async operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: string
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  let delay = retryConfig.initialDelay;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const isRetryable = isRetryableError(error);

      if (!isRetryable || attempt === retryConfig.maxRetries) {
        logger.error({
          context,
          attempt: attempt + 1,
          maxRetries: retryConfig.maxRetries + 1,
          error: lastError,
        }, 'Operation failed after retries');
        throw new RPCError(
          `${context || 'Operation'} failed: ${lastError.message}`,
          lastError,
          isRetryable
        );
      }

      logger.warn({
        context,
        attempt: attempt + 1,
        nextRetryIn: delay,
        error: lastError.message,
      }, 'Retrying operation after error');

      // Wait before retrying
      await sleep(delay);

      // Exponential backoff
      delay = Math.min(delay * retryConfig.backoffMultiplier, retryConfig.maxDelay);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError!;
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof RPCError) {
    return error.retryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors are retryable
    if (
      message.includes('enotfound') ||
      message.includes('econnrefused') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('fetch failed')
    ) {
      return true;
    }

    // Rate limiting errors are retryable
    if (message.includes('429') || message.includes('rate limit')) {
      return true;
    }

    // 5xx server errors are retryable
    if (message.match(/5\d{2}/)) {
      return true;
    }
  }

  // Check for specific error types
  if (typeof error === 'object' && error !== null) {
    const err = error as any;

    // Network errors
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      return true;
    }

    // Fetch errors
    if (err.type === 'system' && err.errno) {
      return true;
    }
  }

  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute multiple operations with fallback
 */
export async function withFallback<T>(
  operations: Array<() => Promise<T>>,
  context?: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < operations.length; i++) {
    try {
      const operation = operations[i];
      if (!operation) continue;
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (i < operations.length - 1) {
        logger.warn({
          context,
          fallbackAttempt: i + 1,
          error: lastError.message,
        }, 'Operation failed, trying fallback');
      }
    }
  }

  logger.error({
    context,
    attempts: operations.length,
    error: lastError,
  }, 'All fallback operations failed');

  throw new RPCError(
    `${context || 'Operation'} failed: ${lastError?.message}`,
    lastError
  );
}
