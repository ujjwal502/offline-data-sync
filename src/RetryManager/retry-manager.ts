import { RetryConfig, SyncConfig, SyncRecord } from "../common.types.js";

export class RetryManager {
  private retryConfig: RetryConfig;

  constructor(config: SyncConfig) {
    this.retryConfig = {
      maxRetries: config.maxRetries || 4,
      baseDelay: config.retryDelay || 1000,
    };
  }

  shouldRetry(record: SyncRecord): boolean {
    return (record.retryCount || 0) < this.retryConfig.maxRetries;
  }

  async waitForNextRetry(record: SyncRecord): Promise<void> {
    const retryCount = record.retryCount || 0;
    const delay = this.calculateExponentialDelay(retryCount);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Calculates delay for the next retry attempt using exponential backoff with jitter
   * @param retryCount - Number of previous retry attempts
   * @returns Delay in milliseconds, capped at 30 seconds
   *
   * Formula: baseDelay * 2^retryCount * jitter
   * - Uses exponential backoff (2^retryCount) to increase delays between retries
   * - Adds random jitter (0.85-1.15) to prevent thundering herd problem
   * - Caps maximum delay at 30000ms (30 seconds)
   */

  private calculateExponentialDelay(retryCount: number): number {
    const jitter = Math.random() * 0.3 + 0.85;
    return Math.min(
      this.retryConfig.baseDelay * Math.pow(2, retryCount) * jitter,
      30000
    );
  }
}
