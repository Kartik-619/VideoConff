import pino, { Logger as PinoLoggerInstance, Level } from "pino";
import type { Logger } from "../../application/ports/Logger";

/**
 * Pino-based structured logger implementing the Logger port.
 */
export class PinoLogger implements Logger {
  private readonly logger: PinoLoggerInstance;

  constructor(options: { level: string; base?: Record<string, unknown>; pretty?: boolean }) {
    const transport = options.pretty
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined;

    this.logger = pino({
      level: options.level as Level,
      base: { service: "videoconff-signaling", ...options.base },
      ...(transport ? { transport } : {}),
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  fatal(obj: Record<string, unknown>, msg?: string): void {
    this.logger.fatal(obj, msg ?? "");
  }

  error(obj: Record<string, unknown>, msg?: string): void {
    this.logger.error(obj, msg ?? "");
  }

  warn(obj: Record<string, unknown>, msg?: string): void {
    this.logger.warn(obj, msg ?? "");
  }

  info(obj: Record<string, unknown>, msg?: string): void {
    this.logger.info(obj, msg ?? "");
  }

  debug(obj: Record<string, unknown>, msg?: string): void {
    this.logger.debug(obj, msg ?? "");
  }

  trace(obj: Record<string, unknown>, msg?: string): void {
    this.logger.trace(obj, msg ?? "");
  }

  child(bindings: Record<string, unknown>): Logger {
    const child = this.logger.child(bindings as pino.Bindings);
    const wrapped: Logger = {
      fatal: (o, m) => child.fatal(o as Record<string, unknown>, m ?? ""),
      error: (o, m) => child.error(o as Record<string, unknown>, m ?? ""),
      warn: (o, m) => child.warn(o as Record<string, unknown>, m ?? ""),
      info: (o, m) => child.info(o as Record<string, unknown>, m ?? ""),
      debug: (o, m) => child.debug(o as Record<string, unknown>, m ?? ""),
      trace: (o, m) => child.trace(o as Record<string, unknown>, m ?? ""),
      child: (b) => wrapped.child(b),
    };
    return wrapped;
  }

  get instance(): PinoLoggerInstance {
    return this.logger;
  }
}
