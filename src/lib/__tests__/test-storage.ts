/**
 * Tiny in-memory Storage stub + a `globalThis.window` shim.
 *
 * The modules under test are browser-only but pure otherwise, so this is
 * deliberately cheaper than pulling jsdom/happy-dom into devDependencies just
 * to get two key/value stores. Only the Storage surface these modules actually
 * touch (getItem/setItem/removeItem/clear) is implemented.
 */

export class MemoryStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

export type StorageHandles = {
  localStorage: MemoryStorage;
  sessionStorage: MemoryStorage;
  /** Simulate closing the tab: sessionStorage dies, localStorage survives. */
  newSession(): void;
};

/**
 * Installs a fake `window` with fresh storages. Call from `beforeEach`.
 *
 * Built on Node's built-in EventTarget so addEventListener/removeEventListener/
 * dispatchEvent work — passport-changelog.ts dispatches a real CustomEvent
 * (hgb:changelog-acknowledged) off `window` for cross-island sync.
 */
export function installFakeWindow(): StorageHandles {
  const localStorage = new MemoryStorage();
  let sessionStorage = new MemoryStorage();
  const win = Object.assign(new EventTarget(), { localStorage });
  Object.defineProperty(win, 'sessionStorage', { get: () => sessionStorage, configurable: true });
  (globalThis as any).window = win;
  return {
    localStorage,
    get sessionStorage() {
      return sessionStorage;
    },
    newSession() {
      sessionStorage = new MemoryStorage();
    },
  } as StorageHandles;
}

/** Removes the fake `window`. Call from `afterEach`. */
export function uninstallFakeWindow(): void {
  delete (globalThis as any).window;
}
