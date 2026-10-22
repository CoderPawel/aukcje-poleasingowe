/**
 * Leasy Group Aukcje (aukcje.leasygroup.pl) – server-rendered listing per category, filtered by subcategory:
 *   /aukcje/<category>/widok-lista/strona-<n>?subcategory=<id>
 * Cards contain title, year, fuel, mileage, sale type, net price and a "Do końca D : H : M" countdown,
 * so detail pages are not fetched.
 *
 * TLS: the server does not send its intermediate certificate (Certum DV TLS G2 R39 CA), so Node's
 * fetch fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE (browsers fill the gap via AIA). When that happens
 * the intermediate is downloaded from the certificate's "CA Issuers" URL and requests go through
 * node:https with the system roots + that intermediate – the chain is still fully verified.
 */
import https from 'node:https';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import * as cheerio from 'cheerio';

const HOST = 'aukcje.leasygroup.pl';
const BASE = `https://${HOST}`;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const CATEGORIES = [
  { path: 'pojazdy-samochodowe-i-motocykle', sub: 6, category: 'Osobowe' },
  { path: 'pojazdy-samochodowe-i-motocykle', sub: 5, category: 'Dostawcze' },
  { path: 'pojazdy-samochodowe-i-motocykle', sub: 4, category: 'Ciężarowe' },
  { path: 'pojazdy-samochodowe-i-motocykle', sub: 60, category: 'Ciągniki siodłowe' },
  { path: 'pojazdy-samochodowe-i-motocykle', sub: 10, category: 'Motocykle i quady' },
  { path: 'pojazdy-samochodowe-i-motocykle', sub: 96, category: 'Kamper', bodyType: 'Kamper' },
  // Whole category last: picks up vehicles without a subcategory.
  { path: 'pojazdy-samochodowe-i-motocykle', category: undefined },
  { path: 'przyczepy-naczepy', category: 'Naczepy i przyczepy' },
  { path: 'maszyny-budowlane', category: 'Maszyny budowlane' },
  { path: 'maszyny-rolnicze-i-nbsp-lesne', category: 'Maszyny rolnicze i leśne' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (el) => el.text().replace(/\s+/g, ' ').trim();

/** "2 336 km" -> 2336 (passed as a number: the generic parser treats the "k" of "km" as "thousands"). */
function integer(s) {
  const n = parseInt(String(s ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Connects once and reports whether the default trust store accepts the server chain. */
function probeTls() {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: HOST, port: 443, servername: HOST, rejectUnauthorized: false }, () => {
      const result = { authorized: socket.authorized, error: socket.authorizationError, cert: socket.getPeerCertificate() };
      socket.end();
      resolve(result);
    });
    socket.setTimeout(20000, () => socket.destroy(new Error('TLS timeout')));
    socket.on('error', reject);
  });
}

/** Downloads the issuing CA named in the leaf's AIA extension and returns it as PEM. */
async function fetchIssuerPem(http, cert) {
  const uri = cert.infoAccess?.['CA Issuers - URI']?.[0];
  if (!uri) throw new Error('Certyfikat bez adresu wystawcy (AIA)');
  const res = await http.request(uri, { useCookies: false });
  return new X509Certificate(Buffer.from(await res.arrayBuffer())).toString();
}

/** Minimal GET over node:https with a custom CA list (fetch() cannot take extra CAs without undici). */
function httpsGet(url, ca, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { ca, headers: { 'User-Agent': UA, 'Accept-Language': 'pl-PL,pl;q=0.9' }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        resolve(httpsGet(new URL(res.headers.location, url).toString(), ca, redirects - 1));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) reject(Object.assign(new Error(`HTTP ${res.statusCode} ${url}`), { status: res.statusCode }));
        else resolve(body);
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Timeout ${url}`)));
    req.on('error', reject);
  });
}

/** Returns a `get(url) -> html` function that works around the incomplete certificate chain if needed. */
async function createGetter(http, log) {
  const probe = await probeTls();
  if (probe.authorized) return (url) => http.text(url);
  if (probe.error !== 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') throw new Error(`TLS: ${probe.error}`);

  log('serwer nie wysyła certyfikatu pośredniego – pobieram go z AIA');
  const ca = [...tls.rootCertificates, await fetchIssuerPem(http, probe.cert)];
  return async (url) => {
    let err;
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(attempt ? 2000 * attempt : 300);
      try {
        return await httpsGet(url, ca);
      } catch (e) {
        err = e;
        if (e.status && e.status < 500) break;
      }
    }
    throw err;
  };
}

/** "6 : 23 : 34" (days : hours : minutes left) -> Date */
function countdownEnd(s) {
  const m = String(s ?? '').match(/(\d+)\s*:\s*(\d+)\s*:\s*(\d+)/);
  if (!m) return undefined;
  const end = Date.now() + ((+m[1] * 24 + +m[2]) * 60 + +m[3]) * 60e3;
  return new Date(Math.round(end / 60e3) * 60e3);
}

function parseCard($, el, cat) {
  const card = $(el);
  const url = card.attr('href');
  const title = text(card.find('.offer_title').first());
  if (!url || !title) return null;

  const rec = {
    id: url.match(/\/aukcja\/(\d+)/)?.[1],
    url,
    title,
    category: cat.category,
    bodyType: cat.bodyType,
    image: (card.find('.offer_image').attr('style') || '').match(/url\(['"]?([^'")]+)/)?.[1],
  };

  // Spec boxes (year / fuel / mileage) carry only icons, so classify by content.
  card.find('.inside_single_box span').each((_, s) => {
    const v = text($(s));
    if (/^(19|20)\d{2}$/.test(v)) rec.year = v;
    else if (/\bkm$/i.test(v)) rec.mileage = integer(v);
    else if (v && !/\d/.test(v)) rec.fuel ??= v;
  });

  card.find('p').each((_, p) => {
    const t = text($(p));
    if (/^Typ aukcji:/i.test(t)) rec.saleType = t.replace(/^Typ aukcji:\s*/i, '');
  });
  rec.price = text(card.find('.price_value').first());
  rec.priceLabel = /kup teraz/i.test(rec.saleType ?? '') ? 'Cena kup teraz' : 'Aktualna cena';
  const currency = text(card.find('.currency_value').first());
  if (/eur/i.test(currency)) rec.currency = 'EUR';
  if (/netto|brutto/i.test(currency)) rec.priceGross = /brutto/i.test(currency);

  rec.endDate = countdownEnd(text(card.find('.time_label .time, .time_label .to_end').first()));
  return rec;
}

export default {
  id: 'leasygroup',
  name: 'Leasy Group Aukcje',
  url: `${BASE}/`,
  note:
    'Serwer nie wysyła certyfikatu pośredniego TLS – scraper dociąga go automatycznie (AIA). ' +
    'Data zakończenia wyliczana z licznika „Do końca” (dokładność do minuty).',
  async scrape({ http, log, maxPages }) {
    const get = await createGetter(http, log);
    const out = [];
    const seen = new Set();
    for (const cat of CATEGORIES) {
      let count = 0;
      for (let page = 1; page <= maxPages; page++) {
        const qs = cat.sub ? `?subcategory=${cat.sub}` : '';
        const $ = cheerio.load(await get(`${BASE}/aukcje/${cat.path}/widok-lista/strona-${page}${qs}`));
        const cards = $('a.single_row_offer');
        if (!cards.length) break;
        cards.each((_, el) => {
          try {
            const rec = parseCard($, el, cat);
            if (rec && !seen.has(rec.id)) {
              seen.add(rec.id);
              out.push(rec);
              count++;
            }
          } catch (e) {
            log(`pominięto kartę (${cat.path}): ${e.message}`);
          }
        });
        const last = Math.max(1, ...$('.pagination_container a, .pagination a').map((_, a) => +($(a).attr('href') || '').match(/strona-(\d+)/)?.[1] || 0).get());
        if (page >= last) break;
      }
      log(`${cat.category ?? cat.path}: ${count}`);
    }
    log(`${out.length} rekordów`);
    return out;
  },
};
