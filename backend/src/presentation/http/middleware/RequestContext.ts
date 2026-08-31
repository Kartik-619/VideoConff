import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

export interface RequestContext {
  requestId: string;
  userId?: string;
  clientIp?: string;
  startedAt: number;
}

export const requestContextStore = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStore.getStore();
}

export function getRequestId(): string {
  return getRequestContext()?.requestId ?? "unknown";
}

/**
 * Assigns a request id to every HTTP request and makes it available via
 * AsyncLocalStorage for structured logging and audit trails.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId =
    (req.headers["x-request-id"] as string) || randomUUID();
  const clientIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress;

  const ctx: RequestContext = {
    requestId,
    clientIp,
    startedAt: Date.now(),
  };

  res.setHeader("x-request-id", requestId);
  res.on("finish", () => {
    ctx.startedAt = Date.now() - ctx.startedAt;
  });

  requestContextStore.run(ctx, () => next());
}
