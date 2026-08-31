import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../../domain/errors/AppError";
import type { Logger } from "../../../application/ports/Logger";
import { getRequestContext } from "./RequestContext";

/**
 * Global error handler. Maps AppErrors to appropriate HTTP status codes and
 * keeps unexpected errors from leaking stack traces to clients.
 */
export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const ctx = getRequestContext();
    const requestId = ctx?.requestId ?? "unknown";

    if (err instanceof AppError) {
      logger.warn(
        { requestId, code: err.code, message: err.message, path: req.path },
        "http.request-rejected"
      );
      res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        requestId,
        retryable: err.retryable,
        details: err.details,
      });
      return;
    }

    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Malformed request body", requestId });
      return;
    }

    logger.error(
      { requestId, error: (err as Error).message, stack: (err as Error).stack, path: req.path },
      "http.unhandled-error"
    );
    res.status(500).json({ error: "Internal server error", requestId });
  };
}
