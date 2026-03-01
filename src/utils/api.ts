// ─── API utility ─────────────────────────────────────────────────────────────
const BASE = '/api';

function getToken(): string | null {
  try {
    const stored = localStorage.getItem('ecclesia_user');
    if (!stored) return null;
    return JSON.parse(stored).token;
  } catch { return null; }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch {
    // Falha de rede (servidor offline, CORS, etc.)
    throw new Error('Sem conexão com o servidor. Verifique se o backend está rodando.');
  }

  // Lê o corpo apenas uma vez, com proteção contra resposta vazia
  let data: any = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const text = await res.text();
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Resposta inválida do servidor (JSON malformado).');
      }
    }
  }

  if (!res.ok) {
    const message = data?.message || `Erro ${res.status}: ${res.statusText || 'Falha na requisição'}`;
    throw new Error(message);
  }

  return data as T;
}

export const api = {
  get:    <T>(path: string)                  => request<T>(path),
  post:   <T>(path: string, body: unknown)   => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)   => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: <T>(path: string)                  => request<T>(path, { method: 'DELETE' }),
};

export default api;
