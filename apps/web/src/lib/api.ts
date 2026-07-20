// Thin fetch wrapper. All requests are same-origin (Vite proxies /api) with cookies.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Transient server states worth retrying — chiefly a serverless DB waking from
// auto-suspend, which can surface as a dropped connection (network error) or a
// 5xx on the very first request after idle. Every write in this app is a single
// atomic operation / transaction, so a retry can never double-apply.
const RETRYABLE = new Set([500, 502, 503, 504]);
const MAX_RETRIES = 2;

async function request<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // Network-level failure (server waking / connection dropped). Retry a couple
    // times with short backoff so a cold start is invisible to the user.
    if (attempt < MAX_RETRIES) { await sleep(350 * (attempt + 1)); return request(method, path, body, attempt + 1); }
    throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่', 0);
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
      await sleep(400 * (attempt + 1));
      return request(method, path, body, attempt + 1);
    }
    throw new ApiError(data?.error || `คำขอผิดพลาด (${res.status})`, res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

// Multipart upload — returns the stored file URL.
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', credentials: 'include', body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || 'อัปโหลดรูปไม่สำเร็จ', res.status);
  return data.url as string;
}
