import type { Request, Response, NextFunction } from "express";
import type { AuthService } from "../../../application/services/AuthService";
import { AppError, ErrorCode } from "../../../domain/errors/AppError";
import { getRequestContext } from "./RequestContext";

/**
 * Verifies the bearer JWT for protected HTTP routes and attaches the
 * authenticated user id to the request context.
 */
export function authMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith("Bearer ")) {
        throw AppError.unauthorized("Missing bearer token");
      }
      const token = header.slice("Bearer ".length);
      const user = await authService.authenticateWsToken(token);

      const ctx = getRequestContext();
      if (ctx) ctx.userId = user.id;
      res.locals.user = user;
      next();
    } catch (err) {
      next(err instanceof AppError ? err : AppError.unauthorized());
    }
  };
}

export function getAuthenticatedUser(res: Response): { id: string; role?: "HOST" | "PARTICIPANT" } {
  const user = res.locals.user as { id: string; role?: "HOST" | "PARTICIPANT" } | undefined;
  if (!user) {
    throw new AppError(ErrorCode.UNAUTHORIZED, "Not authenticated");
  }
  return user;
}
