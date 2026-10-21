export interface BridgeClient { origin: string; token: string }

async function request<T>(client: BridgeClient, path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), path.endsWith('/generate') ? 125_000 : 12_000);
  try {
    const res = await fetch(`${client.origin}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${client.token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: init?.signal ?? controller.signal,
    });
    const data = await res.json() as T & { error?: string };
    if (!res.ok) throw new Error(data.error || `Bridge returned HTTP ${res.status}`);
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

export function listModels(client: BridgeClient): Promise<{ models: string[] }> {
  return request(client, '/api/models');
}

export function generate(client: BridgeClient, model: string, prompt: string, signal: AbortSignal): Promise<{ response: string; elapsed_ms: number }> {
  return request(client, '/api/generate', {
    method: 'POST', body: JSON.stringify({ model, prompt }), signal,
  });
}

export const DEFAULT_BRIDGE = 'http://127.0.0.1:8765';
