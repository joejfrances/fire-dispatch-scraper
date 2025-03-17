import { Logger } from '../utils/logger';

export enum CircuitState {
  CLOSED,  // Normal operation
  OPEN,    // Failing, reject fast
  HALF_OPEN // Testing if system has recovered
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  
  constructor(
    failureThreshold: number = 5,
    resetTimeoutMs: number = 60000 // 1 minute
  ) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }
  
  async executeWithCircuitBreaker<T>(operation: () => Promise<T>, fallback: () => T): Promise<T> {
    // Check if circuit is OPEN
    if (this.state === CircuitState.OPEN) {
      // Check if it's time to try again
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        Logger.info('Circuit half-open, testing service availability');
      } else {
        Logger.warning('Circuit open, fast failing request');
        return fallback();
      }
    }
    
    try {
      // Execute operation
      const result = await operation();
      
      // If successful and in HALF_OPEN, close the circuit
      if (this.state === CircuitState.HALF_OPEN) {
        this.closeCircuit();
      }
      
      return result;
    } catch (error) {
      // Record failure
      this.recordFailure();
      
      // If threshold reached, open circuit
      if (this.state === CircuitState.CLOSED && this.failureCount >= this.failureThreshold) {
        this.openCircuit();
      }
      
      // Return fallback
      return fallback();
    }
  }
  
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
  }
  
  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    Logger.warning(`Circuit opened after ${this.failureCount} failures`);
  }
  
  private closeCircuit(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    Logger.info('Circuit closed, service recovered');
  }
} 