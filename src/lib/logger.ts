/**
 * Logger interface for Volumio clients
 * Compatible with ioBroker adapter logger
 */
export interface Logger {
  silly(message: string): void;
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * No-op logger for cases where logging is not needed
 * Used as default when no logger is provided
 */
export class NoOpLogger implements Logger {
  silly(_message: string): void {
    // No-op
  }

  debug(_message: string): void {
    // No-op
  }

  info(_message: string): void {
    // No-op
  }

  warn(_message: string): void {
    // No-op
  }

  error(_message: string): void {
    // No-op
  }
}
