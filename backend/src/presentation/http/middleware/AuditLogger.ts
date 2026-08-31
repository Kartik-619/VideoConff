import type { Request, Response, NextFunction } from "express";
import type { Logger } from "../../../application/ports/Logger";
import { getRequestContext } from "./RequestContext";

const AUDIT_EVENTS = new Set([
  "POST:/leave",
  "POST:/endMeeting",
  "POST:/startMeeting",
  "POST:/api/auth/refresh",
  "POST:/api/auth/revoke",
]);

/**
 * Audit logger for security-relevant requests (meeting lifecycle, auth
 * flows). Writes an audit trail line to a dedicated logger.
 */
export function auditLogger(auditLog: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.method}:${req.path}`;
    if (AUDIT_EVENTS.has(key)) {
      const ctx = getRequestContext();
      const userId = ctx?.userId ?? (res.locals.user as { id?: string } | undefined)?.id;
      res.on("finish", () => {
        auditLog.info(
          {
            requestId: ctx?.requestId,
            userId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            clientIp: ctx?.clientIp,
            durationMs: Date.now() - (ctx?.startedAt ?? Date.now()),
          },
          "audit.http-event"
        );
      });
    }
    next();
  };
}
