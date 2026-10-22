const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Minimal cookie jar so sources that rely on session cookies (CSRF, consent) work.
 */
export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  store(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  get(name) {
    return this.cookies.get(name);
  }
}

export function createHttp({ delayMs = 300, timeoutMs = 30000, retries = 2 } = {}) {
  const jar = new CookieJar();
  let last = 0;

  async function request(url, opts = {}) {
    const { headers = {}, json, form, method, raw = false, useCookies = true, ...rest } = opts;
    const h = {
      'User-Agent': DEFAULT_UA,
      'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      ...headers,
    };
    let body = rest.body;
    if (json !== undefined) {
      body = JSON.stringify(json);
      h['Content-Type'] ??= 'application/json';
    } else if (form !== undefined) {
      body = new URLSearchParams(form).toString();
      h['Content-Type'] ??= 'application/x-www-form-urlencoded';
    }
    if (useCookies && jar.cookies.size && !h.Cookie) h.Cookie = jar.header();

    let err;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const wait = last + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      try {
        const res = await fetch(url, {
          ...rest,
          method: method ?? (body ? 'POST' : 'GET'),
          headers: h,
          body,
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (useCookies) jar.store(res);
        if (raw) return res;
        if (res.status >= 500 || res.status === 429) {
          err = new Error(`HTTP ${res.status} ${url}`);
          await sleep(1000 * (attempt + 1) * 2);
          continue;
        }
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${url}`), { status: res.status });
        return res;
      } catch (e) {
        err = e;
        if (e.status && e.status < 500) throw e;
        await sleep(1000 * (attempt + 1) * 2);
      }
    }
    throw err;
  }

  return {
    jar,
    request,
    async text(url, opts) {
      const res = await request(url, opts);
      return res.text();
    },
    async json(url, opts = {}) {
      const res = await request(url, {
        ...opts,
        headers: { Accept: 'application/json, text/plain, */*', ...(opts.headers || {}) },
      });
      return res.json();
    },
  };
}
