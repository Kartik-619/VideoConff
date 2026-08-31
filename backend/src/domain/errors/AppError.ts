export enum ErrorCode {
  VALIDATION = "VALIDATION",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  RATE_LIMITED = "RATE_LIMITED",
  MESSAGE_TOO_LARGE = "MESSAGE_TOO_LARGE",
  ROOM_NOT_FOUND = "ROOM_NOT_FOUND",
  PEER_NOT_FOUND = "PEER_NOT_FOUND",
  INTERNAL = "INTERNAL",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  TIMEOUT = "TIMEOUT",
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { statusCode?: number; retryable?: boolean; details?: unknown; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = options.statusCode ?? statusFor(code);
    this.retryable = options.retryable ?? retryableFor(code);
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.VALIDATION, message, { details });
  }

  static unauthorized(message = "Unauthorized"): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message);
  }

  static forbidden(message = "Forbidden"): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message);
  }

  static notFound(message = "Not found"): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message);
  }

  static rateLimited(message = "Too many requests", details?: unknown): AppError {
    return new AppError(ErrorCode.RATE_LIMITED, message, { details });
  }

  static internal(message = "Internal server error", cause?: unknown): AppError {
    return new AppError(ErrorCode.INTERNAL, message, { cause });
  }
}

export function statusFor(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.VALIDATION:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.NOT_FOUND:
    case ErrorCode.ROOM_NOT_FOUND:
    case ErrorCode.PEER_NOT_FOUND:
      return 404;
    case ErrorCode.CONFLICT:
      return 409;
    case ErrorCode.RATE_LIMITED:
      return 429;
    case ErrorCode.MESSAGE_TOO_LARGE:
      return 413;
    default:
      return 500;
  }
}

export function retryableFor(code: ErrorCode): boolean {
  switch (code) {
    case ErrorCode.TIMEOUT:
    case ErrorCode.SERVICE_UNAVAILABLE:
    case ErrorCode.INTERNAL:
      return true;
    default:
      return false;
  }
}
