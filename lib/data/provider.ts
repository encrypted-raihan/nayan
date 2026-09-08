export type NayanDataProvider<T> = {
  key: string;
  fetch: (signal?: AbortSignal) => Promise<T>;
};

export type NayanDataResult<T> = {
  data: T;
  fetchedAt: number;
  fromCache: boolean;
};
