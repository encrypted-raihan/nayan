type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

export class NayanDataCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string, maxAgeMs: number): CacheEntry<T> | null {
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > maxAgeMs) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  set<T>(key: string, data: T): CacheEntry<T> {
    const entry = { data, fetchedAt: Date.now() };
    this.entries.set(key, entry);
    return entry;
  }

  clear(key?: string): void {
    if (key) this.entries.delete(key);
    else this.entries.clear();
  }
}
