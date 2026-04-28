const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json()
}

async function patch(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`)
}

export const api = {
  pipeline:     () => get<{ content: string }>('/pipeline'),
  applications: () => get<{ content: string }>('/applications'),
  scanHistory:  () => get<{ content: string }>('/scan-history'),
  reports:      () => get<{ files: string[] }>('/reports'),
  report:       (id: string) => get<{ content: string; filename: string }>(`/reports/${id}`),
  patterns:     () => get<{ content: string }>('/patterns'),
  updateStatus: (number: number, status: string) => patch(`/applications/${number}`, { status }),
  markPipeline: (url: string, action: 'done' | 'skip') => patch('/pipeline', { url, action }),
}
