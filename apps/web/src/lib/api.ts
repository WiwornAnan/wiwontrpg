// Thin fetch wrapper. All requests are same-origin (Vite proxies /api) with cookies.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
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
