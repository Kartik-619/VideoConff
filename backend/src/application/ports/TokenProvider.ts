export interface TokenClaims {
  sub: string;
  jti?: string;
  iat?: number;
  exp?: number;
  role?: "HOST" | "PARTICIPANT";
}

export interface TokenProviderPort {
  verify(token: string): Promise<TokenClaims>;
  /** Returns the token id (jti) if the token has one. */
  getTokenId(token: string): string | null;
}
