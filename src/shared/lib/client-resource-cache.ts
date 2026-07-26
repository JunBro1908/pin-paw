/**
 * 브라우저 탭 내 공유 리소스 캐시 (SWR-lite).
 * 동일 accessToken으로 여러 화면이 같은 목록을 재요청하지 않게 한다.
 */

type CacheEntry<T> = {
  accessToken: string;
  items: T[];
  fetchedAt: number;
  inFlight: Promise<T[]> | null;
};

type Store<T> = {
  entry: CacheEntry<T> | null;
  listeners: Set<() => void>;
  version: number;
};

function createStore<T>(): Store<T> {
  return { entry: null, listeners: new Set(), version: 0 };
}

function notify<T>(store: Store<T>) {
  store.version += 1;
  for (const listener of store.listeners) listener();
}

export function createAuthenticatedListCache<T>(options: {
  key: string;
  ttlMs: number;
  fetcher: (accessToken: string) => Promise<T[]>;
}) {
  const store = createStore<T>();

  function peek(accessToken: string): T[] | null {
    const entry = store.entry;
    if (!entry || entry.accessToken !== accessToken) return null;
    return entry.items;
  }

  function isFresh(accessToken: string): boolean {
    const entry = store.entry;
    if (!entry || entry.accessToken !== accessToken) return false;
    return Date.now() - entry.fetchedAt < options.ttlMs;
  }

  async function load(
    accessToken: string,
    opts?: { force?: boolean }
  ): Promise<T[]> {
    const force = opts?.force === true;
    const entry = store.entry;

    if (
      !force &&
      entry &&
      entry.accessToken === accessToken &&
      Date.now() - entry.fetchedAt < options.ttlMs
    ) {
      return entry.items;
    }

    if (entry?.inFlight && entry.accessToken === accessToken && !force) {
      return entry.inFlight;
    }

    const promise = options.fetcher(accessToken).then(
      (items) => {
        store.entry = {
          accessToken,
          items,
          fetchedAt: Date.now(),
          inFlight: null,
        };
        notify(store);
        return items;
      },
      (error) => {
        if (store.entry?.inFlight === promise) {
          store.entry = {
            ...store.entry,
            inFlight: null,
          };
          notify(store);
        }
        throw error;
      }
    );

    store.entry = {
      accessToken,
      items: entry?.accessToken === accessToken ? entry.items : [],
      fetchedAt: entry?.accessToken === accessToken ? entry.fetchedAt : 0,
      inFlight: promise,
    };
    notify(store);
    return promise;
  }

  function invalidate() {
    store.entry = null;
    notify(store);
  }

  function getVersion() {
    return store.version;
  }

  function subscribe(listener: () => void): () => void {
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  }

  return {
    key: options.key,
    peek,
    isFresh,
    load,
    invalidate,
    subscribe,
    getVersion,
  };
}

export async function fetchAuthenticatedJsonList<T>(
  url: string,
  accessToken: string
): Promise<T[]> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error("목록을 불러올 수 없습니다.");
  }
  const json = (await response.json()) as {
    success?: boolean;
    data?: unknown;
  };
  if (!json.success || !Array.isArray(json.data)) {
    throw new Error("목록을 불러올 수 없습니다.");
  }
  return json.data as T[];
}
