/**
 * HTTP transport for utils/youtube.ts on the phone: plain fetch.
 * The desktop build swaps in ytFetch.web.ts (same signatures), which routes
 * through the Electron main process because a browser renderer can't read
 * youtube.com cross-origin.
 */
export async function httpGetText(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
  return res.text();
}

export async function httpPostJson(
  url: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal,
): Promise<any> {
  const res = await fetch(url, { method: 'POST', headers, body, signal });
  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
  return res.json();
}

/** Suggestions: an empty result rather than an error when it fails. */
export async function httpGetJson(url: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  return res.json();
}
