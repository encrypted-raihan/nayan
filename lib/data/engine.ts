import { NayanDataCache } from "./cache";
import type { NayanDataProvider, NayanDataResult } from "./provider";

const DEFAULT_CACHE_TTL_MS = 60_000;

export class NayanDataEngine {
  private readonly cache = new NayanDataCache();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  async get<T>(
    provider: NayanDataProvider<T>,
    options: { cacheTtlMs?: number; signal?: AbortSignal } = {},
  ): Promise<NayanDataResult<T>> {
    const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const cached = this.cache.get<T>(provider.key, cacheTtlMs);
    if (cached) {
      return { data: cached.data, fetchedAt: cached.fetchedAt, fromCache: true };
    }

    let request = this.inFlight.get(provider.key) as Promise<NayanDataResult<T>> | undefined;
    if (!request) {
      request = provider.fetch().then((data) => {
        const entry = this.cache.set(provider.key, data);
        this.inFlight.delete(provider.key);
        return { data: entry.data, fetchedAt: entry.fetchedAt, fromCache: false };
      }).catch((error) => {
        this.inFlight.delete(provider.key);
        throw error;
      });
      this.inFlight.set(provider.key, request);
    }

    if (!options.signal) return request;

    if (options.signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");

    return new Promise<NayanDataResult<T>>((resolve, reject) => {
      const onAbort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
      options.signal!.addEventListener("abort", onAbort, { once: true });
      request!.then(
        (result) => {
          options.signal!.removeEventListener("abort", onAbort);
          resolve(result);
        },
        (error) => {
          options.signal!.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  }

  invalidate(key: string): void {
    this.cache.clear(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const nayanDataEngine = new NayanDataEngine();
