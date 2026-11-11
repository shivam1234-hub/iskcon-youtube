/**
 * Desktop (Electron) transport for utils/youtube.ts.
 *
 * The renderer is a web page on a loopback origin, so a direct fetch of
 * youtube.com / suggestqueries is blocked by CORS. The preload bridge hands
 * the request to the main process (desktop/lib/net.js), which has no CORS and
 * only talks to those hosts. An AbortSignal can't cross IPC, so aborting just
 * rejects here and the late reply is dropped.
 */
interface NetBridge {
  request: (req: {
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
  }) => Promise<{ ok: boolean; status: number; text: string } | null>;
}

const bridge = (): NetBridge | null =>
  typeof window !== 'undefined' ? ((window as any).desktop?.net ?? null) : null;

function abortError() {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

async function request(
  url: string,
  init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; text: string }> {
  if (signal?.aborted) throw abortError();
  const b = bridge();
  // A plain browser (no Electron): try a direct fetch; it only works where
  // CORS allows, but keeps `expo start --web` usable for layout work.
  const work: Promise<{ ok: boolean; status: number; text: string }> = b
    ? b.request({ url, ...init }).then((r) => r ?? { ok: false, status: 0, text: '' })
    : fetch(url, { method: init.method, headers: init.body ? { 'Content-Type': 'application/json' } : undefined, body: init.body })
        .then(async (r) => ({ ok: r.ok, status: r.status, text: await r.text() }));
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (r) => {
        signal.removeEventListener('abort', onAbort);
        resolve(r);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

export async function httpGetText(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<string> {
  const r = await request(url, { method: 'GET', headers }, signal);
  if (!r.ok) throw new Error(r.status ? `YouTube returned ${r.status}` : "Couldn't reach YouTube");
  return r.text;
}

export async function httpPostJson(
  url: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal,
): Promise<any> {
  const r = await request(url, { method: 'POST', headers, body }, signal);
  if (!r.ok) throw new Error(r.status ? `YouTube returned ${r.status}` : "Couldn't reach YouTube");
  return JSON.parse(r.text);
}

export async function httpGetJson(url: string, signal?: AbortSignal): Promise<any> {
  const r = await request(url, { method: 'GET' }, signal);
  if (!r.ok) return null;
  try {
    return JSON.parse(r.text);
  } catch {
    return null;
  }
}
