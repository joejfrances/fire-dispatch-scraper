export enum LogLevel {
  INFO = 'INFO',
  ERROR = 'ERROR',
  WARNING = 'WARNING',
}

export class Logger {
  private static formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  static info(message: string): void {
    console.log(this.formatMessage(LogLevel.INFO, message));
  }

  static error(message: string, error?: Error): void {
    console.error(this.formatMessage(LogLevel.ERROR, message));
    if (error) {
      console.error(error.stack);
    }
  }

  static warning(message: string): void {
    console.warn(this.formatMessage(LogLevel.WARNING, message));
  }
} 