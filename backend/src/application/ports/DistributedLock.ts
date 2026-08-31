export interface DistributedLockPort {
  /** Acquires a lock; returns false immediately if already held. */
  acquire(key: string, ttlMs: number, token?: string): Promise<boolean>;
  /** Releases the lock if the token matches (safety against stale release). */
  release(key: string, token: string): Promise<void>;
  /** Runs fn under the lock, polling until acquired or timeout. */
  withLock<T>(key: string, ttlMs: number, timeoutMs: number, fn: () => Promise<T>): Promise<T>;
}
