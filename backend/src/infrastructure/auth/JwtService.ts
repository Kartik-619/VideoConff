import jwt from "jsonwebtoken";
import type { TokenProviderPort, TokenClaims } from "../../application/ports/TokenProvider";
import type { Logger } from "../../application/ports/Logger";

export interface JwtServiceDeps {
  secret: string;
  logger: Logger;
}

/**
 * JWT token provider. Verifies the short-lived WebSocket tokens issued by
 * the Next.js frontend and extracts claims for session binding.
 */
export class JwtService implements TokenProviderPort {
  constructor(private readonly deps: JwtServiceDeps) {}

  async verify(token: string): Promise<TokenClaims> {
    const decoded = jwt.verify(token, this.deps.secret) as jwt.JwtPayload;
    const sub = typeof decoded.sub === "string" ? decoded.sub : (decoded.id as string | undefined);
    if (!sub) {
      throw new Error("Token has no subject");
    }
    return {
      sub,
      jti: decoded.jti,
      iat: decoded.iat,
      exp: decoded.exp,
      role: decoded.role as TokenClaims["role"],
    };
  }

  getTokenId(token: string): string | null {
    try {
      const decoded = jwt.decode(token) as jwt.JwtPayload | null;
      return decoded?.jti ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Creates a refresh token. Returns the raw token plus its id so callers
   * can persist the session.
   */
  signRefresh(userId: string, ttlSeconds: number): { token: string; jti: string } {
    const jti = crypto.randomUUID();
    const token = jwt.sign({ id: userId }, this.deps.secret, {
      expiresIn: ttlSeconds,
      jwtid: jti,
    });
    return { token, jti };
  }
}
