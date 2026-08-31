export interface Command<TPayload = unknown, TResult = void> {
  readonly name: string;
  readonly payload: TPayload;
}

export class CommandResult<T = unknown> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: Error;

  private constructor(ok: boolean, value?: T, error?: Error) {
    this.ok = ok;
    this.value = value;
    this.error = error;
  }

  static success<T>(value: T): CommandResult<T> {
    return new CommandResult<T>(true, value);
  }

  static failure<T>(error: Error): CommandResult<T> {
    return new CommandResult<T>(false, undefined, error);
  }
}

export interface CommandHandler<TCommand extends Command<unknown, unknown> = Command<unknown, unknown>> {
  handle(command: TCommand): Promise<unknown>;
}
