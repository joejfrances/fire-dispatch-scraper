import { Logger } from '../utils/logger';

export class RateLimiter {
  private requestTimestamps: number[] = [];
  private readonly requestsPerMinute: number;

  constructor(requestsPerMinute: number = 60) {
    this.requestsPerMinute = requestsPerMinute;
  }

  async waitForPermission(): Promise<void> {
    const now = Date.now();
    
    // Remove timestamps older than 1 minute
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < 60000
    );
    
    // Check if we're at the limit
    if (this.requestTimestamps.length >= this.requestsPerMinute) {
      // Calculate wait time (wait until oldest request is 1 min old)
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = 60000 - (now - oldestRequest) + 100; // Add 100ms buffer
      
      if (waitTime > 0) {
        Logger.warning(`Rate limit approaching. Waiting ${waitTime}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Add current timestamp to the queue
    this.requestTimestamps.push(Date.now());
  }
  
  resetLimiter(): void {
    this.requestTimestamps = [];
  }
} 