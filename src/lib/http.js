// Tiny fetch wrapper: JSON in/out, readable errors, retries on 429/5xx.

export class HttpError extends Error {
  constructor(message, { status, body, url }) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function request(url, { method = 'GET', headers = {}, body, retries = 3, raw = false } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    if (typeof body === 'string' || body instanceof URLSearchParams) {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] ??= 'application/json; charset=utf-8';
    }
  }

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const text = await res.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* keep as text */
    }

    if (res.ok) return raw ? { status: res.status, data } : data;

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const detail = typeof data === 'object' && data ? JSON.stringify(data.error ?? data) : String(text).slice(0, 500);
    throw new HttpError(`${method} ${redact(url)} -> ${res.status}: ${detail}`, { status: res.status, body: data, url });
  }
}

// Never print API keys that travel in query strings (Bing does this).
export function redact(url) {
  return String(url).replace(/(apikey|key|token)=[^&]+/gi, '$1=***');
}
