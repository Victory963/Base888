import { create, type StateCreator } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Mirrors Base44's create-zustand-store + persist-to-storage + actions.middleware:
// a thin factory that optionally persists to localStorage and logs action names
// in dev. All storage access is guarded so private-mode / blocked storage is safe.

const safeStorage = createJSONStorage(() => {
  try {
    const probe = "__b888_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k)
    } as Storage;
  }
});

export interface StoreOptions {
  name: string;
  persistKeys?: string[];
}

export function createStore<T extends object>(initializer: StateCreator<T>, options: StoreOptions) {
  const withActionsLog: StateCreator<T> = (set, get, api) =>
    initializer(
      (partial, replace) => {
        if (import.meta.env.DEV) {
          // actions.middleware: name the mutation for debugging
          // eslint-disable-next-line no-console
          console.debug(`[store:${options.name}] set`);
        }
        return (set as unknown as (p: typeof partial, r?: typeof replace) => void)(partial, replace);
      },
      get,
      api
    );

  if (!options.persistKeys || options.persistKeys.length === 0) {
    return create<T>(withActionsLog);
  }

  return create<T>()(
    persist(withActionsLog, {
      name: `base888.${options.name}`,
      storage: safeStorage,
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(([k]) => options.persistKeys!.includes(k))
        ) as Partial<T>
    })
  );
}
