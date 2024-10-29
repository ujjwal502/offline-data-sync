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

  private calculateExponentialDelay(retryCount: number): number {
    const jitter = Math.random() * 0.3 + 0.85;
    return (
      Math.min(this.retryConfig.baseDelay * Math.pow(2, retryCount)) * jitter,
      30000
    );
  }
}
