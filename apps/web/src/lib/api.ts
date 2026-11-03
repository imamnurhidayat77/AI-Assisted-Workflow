const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const KEY_STORAGE = 'street-smart-api-key';

export function getStoredKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setStoredKey(key: string): void {
  try {
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
  } catch { /* abaikan */ }
}

/** Hook global untuk 401/403 — dipasang AuthProvider (logout + toast). Default: diam. */
let authErrorHandler: ((status: number) => void) | null = null;
export function onAuthError(fn: ((status: number) => void) | null): void {
  authErrorHandler = fn;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = typeof window !== 'undefined' ? getStoredKey() : '';
  if (key) h['X-API-Key'] = key;
  return h;
}

function notify(res: Response): void {
  if ((res.status === 401 || res.status === 403) && authErrorHandler) {
    try {
      authErrorHandler(res.status);
    } catch { /* abaikan */ }
  }
}

/** GET dengan fallback. shortcut: error HTTP (termasuk 503 DB mati) ikut
 * ditelan jadi fallback — halaman menampilkan empty state, bukan pesan error
 * eksplisit. Upgrade: lempar {status} agar halaman bedakan "kosong" vs "error". */
async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', headers: headers() });
    if (!res.ok) {
      notify(res);
      throw new Error(String(res.status));
    }
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function post<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      notify(res);
      throw new Error(String(res.status));
    }
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function patch<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      notify(res);
      throw new Error(String(res.status));
    }
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function del<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: headers() });
    if (!res.ok) {
      notify(res);
      throw new Error(String(res.status));
    }
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const api = { get, post, patch, del, base: API_BASE };
