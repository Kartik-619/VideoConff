export interface RateLimiterPort {
  /**
   * Attempts to consume a token. Returns the current count and whether the
   * request should be allowed.
   */
  consume(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }>;
}

export interface PubSubPort {
  publish(channel: string, message: unknown): Promise<void>;
  subscribe(channel: string, handler: (message: unknown) => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

export interface TokenBlacklistPort {
  add(tokenId: string, expiresInSeconds: number): Promise<void>;
  isBlacklisted(tokenId: string): Promise<boolean>;
}

export interface SessionStorePort {
  /** Registers a live session for a user. */
  setSession(userId: string, sessionId: string, ttlSeconds: number): Promise<void>;
  /** Removes a session (logout / expiry). */
  removeSession(userId: string, sessionId: string): Promise<void>;
  /** Lists active sessions for a user (multi-tab support). */
  listSessions(userId: string): Promise<string[]>;
}
