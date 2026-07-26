export interface AuthenticatedListSnapshot<T> {
  accessToken: string;
  items: T[];
  error: string | null;
}

export interface AuthenticatedListView<T> {
  loading: boolean;
  items: T[];
  error: string | null;
}

export function getAuthenticatedListView<T>(
  accessToken: string | undefined,
  snapshot: AuthenticatedListSnapshot<T> | null
): AuthenticatedListView<T> {
  if (!accessToken) {
    return { loading: false, items: [], error: null };
  }

  if (snapshot?.accessToken !== accessToken) {
    return { loading: true, items: [], error: null };
  }

  return {
    loading: false,
    items: snapshot.items,
    error: snapshot.error,
  };
}
