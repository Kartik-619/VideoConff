/**
 * Lightweight dependency injection container with lazy singletons and
 * automatic dependency resolution via factory functions.
 */
export class Container {
  private readonly factories = new Map<string, Factory<any>>();
  private readonly singletons = new Map<string, unknown>();

  register<T>(token: string, factory: Factory<T>): void {
    if (this.factories.has(token)) {
      throw new Error(`Dependency '${token}' already registered`);
    }
    this.factories.set(token, factory);
  }

  resolve<T>(token: string): T {
    const cached = this.singletons.get(token);
    if (cached !== undefined) return cached as T;

    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`Dependency '${token}' is not registered`);
    }

    const instance = factory(this);
    this.singletons.set(token, instance);
    return instance as T;
  }

  get<T>(token: string): T | undefined {
    return this.singletons.get(token) as T | undefined;
  }

  /** Replaces a singleton (used by tests). */
  registerInstance<T>(token: string, instance: T): void {
    this.singletons.set(token, instance);
  }

  reset(): void {
    this.singletons.clear();
    this.factories.clear();
  }
}

export type Factory<T> = (container: Container) => T;

export function lazy<T>(factory: Factory<T>): Factory<T> {
  let cached: T | undefined;
  return (container: Container): T => {
    if (cached === undefined) {
      cached = factory(container);
    }
    return cached;
  };
}
