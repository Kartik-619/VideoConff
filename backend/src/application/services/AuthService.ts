import { AppError, ErrorCode } from "../../domain/errors/AppError";
import type { TokenProviderPort, TokenClaims } from "../ports/TokenProvider";
import type { TokenBlacklistPort, SessionStorePort } from "../ports/SharedPorts";
import type { Logger } from "../ports/Logger";

export interface AuthServiceDeps {
  tokenProvider: TokenProviderPort;
  tokenBlacklist: TokenBlacklistPort;
  sessionStore: SessionStorePort;
  logger: Logger;
}

export interface AuthenticatedUser {
  id: string;
  role?: "HOST" | "PARTICIPANT";
  jti?: string;
}

/**
 * Application-level authentication orchestration: verifies tokens, checks
 * blacklists, and manages user sessions (multi-tab support).
 */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async authenticateWsToken(token: string): Promise<AuthenticatedUser> {
    let claims: TokenClaims;
    try {
      claims = await this.deps.tokenProvider.verify(token);
    } catch {
      this.deps.logger.warn({}, "ws-auth: invalid token");
      throw AppError.unauthorized("Invalid or expired token");
    }

    if (claims.jti) {
      const blacklisted = await this.deps.tokenBlacklist.isBlacklisted(claims.jti);
      if (blacklisted) {
        this.deps.logger.warn({ jti: claims.jti }, "ws-auth: blacklisted token");
        throw AppError.unauthorized("Token has been revoked");
      }
    }

    return { id: claims.sub, role: claims.role, jti: claims.jti };
  }

  async startSession(userId: string, sessionId: string, ttlSeconds: number): Promise<void> {
    await this.deps.sessionStore.setSession(userId, sessionId, ttlSeconds);
  }

  async endSession(userId: string, sessionId: string): Promise<void> {
    await this.deps.sessionStore.removeSession(userId, sessionId);
  }

  async revokeToken(jti: string, expiresInSeconds: number): Promise<void> {
    await this.deps.tokenBlacklist.add(jti, expiresInSeconds);
  }

  async assertRole(user: AuthenticatedUser, required: "HOST"): Promise<void> {
    if (user.role && required && user.role !== required) {
      throw AppError.forbidden("Insufficient permissions");
    }
  }

  async listSessions(userId: string): Promise<string[]> {
    return this.deps.sessionStore.listSessions(userId);
  }
}
