import { AppError, ErrorCode } from "../../domain/errors/AppError";
import type { Logger } from "../ports/Logger";
import { CommandResult, Command, CommandHandler } from "./Command";

export interface CommandBus {
  register<TCommand extends Command>(name: string, handler: CommandHandler<TCommand>): void;
  execute<TCommand extends Command, TResult = unknown>(
    command: TCommand
  ): Promise<CommandResult<TResult>>;
}

interface HandlerEntry {
  handler: CommandHandler;
}

/**
 * Synchronous command dispatcher (Command pattern). Handlers are registered
 * by command name; the bus routes commands to their handler, centralizes
 * error handling and adds request-id aware logging.
 */
export class SyncCommandBus implements CommandBus {
  private readonly handlers = new Map<string, HandlerEntry>();
  private readonly logger: Logger;

  constructor(deps: { logger: Logger }) {
    this.logger = deps.logger;
  }

  register<TCommand extends Command>(name: string, handler: CommandHandler<TCommand>): void {
    if (this.handlers.has(name)) {
      throw new AppError(ErrorCode.CONFLICT, `Handler already registered for command '${name}'`);
    }
    this.handlers.set(name, { handler });
  }

  async execute<TCommand extends Command, TResult = unknown>(
    command: TCommand
  ): Promise<CommandResult<TResult>> {
    const entry = this.handlers.get(command.name);
    if (!entry) {
      return CommandResult.failure<TResult>(
        new AppError(ErrorCode.NOT_FOUND, `No handler for command '${command.name}'`)
      );
    }

    const startedAt = performance.now();
    try {
      const value = (await entry.handler.handle(command)) as TResult;
      this.logger.debug(
        { command: command.name, durationMs: performance.now() - startedAt },
        "command executed"
      );
      return CommandResult.success(value);
    } catch (err) {
      this.logger.error(
        { command: command.name, error: (err as Error).message },
        "command failed"
      );
      return CommandResult.failure<TResult>(
        err instanceof AppError ? err : AppError.internal(undefined, err)
      );
    }
  }
}
