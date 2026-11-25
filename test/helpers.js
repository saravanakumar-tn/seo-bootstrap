// Minimal fetch mock: routes are [method, RegExp, handler(url, body) -> json | {status, json}]
export function mockFetch(routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body;
    calls.push({ method, url: String(url), body });
    const route = routes.find(([m, re]) => m === method && re.test(String(url)));
    if (!route) return new Response(JSON.stringify({ error: `no mock for ${method} ${url}` }), { status: 404 });
    const out = await route[2](String(url), body);
    const status = out?.__status ?? 200;
    return new Response(JSON.stringify(out?.__json ?? out ?? {}), { status });
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

export const silent = () => {};
