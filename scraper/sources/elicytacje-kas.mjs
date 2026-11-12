/**
 * eLicytacje KAS (elicytacje.mf.gov.pl) – enforcement sales of Polish tax offices (Ministry of Finance).
 * Announcements are public by law (art. 67da § 6 u.p.e.a.: no account needed to view them).
 * The Angular front end uses a JSON API:
 *   POST /auction/api/v1/announcement/external?page=N&size=100   body: { sectionId, categoryId, filters }
 * The list already carries title, prices, sale dates and location, so detail pages are not fetched – the
 * portal sits behind Imperva/Incapsula and the module keeps its request count low (~8 per run).
 * When Incapsula answers with a challenge page instead of JSON the run fails and the previous data is kept.
 * Thumbnails (/api/v1/items/pictures/<id>/thumbnail) are not used: Incapsula does not serve them to
 * visitors of another site that have no session cookie.
 */
import { titleCase } from '../lib/normalize.mjs';

const BASE = 'https://elicytacje.mf.gov.pl/auction';
const API = `${BASE}/api`;
const SECTION_MOVABLES = '3e026ac1-291f-4898-9229-61d1074fcfe5';
const CATEGORY_VEHICLES = 'f833e4c3-2fd9-4585-87a4-4b2a896cb86f';
const PAGE_SIZE = 100;

const SALE_TYPES = { LIC: 'Licytacja', SPR: 'Sprzedaż z wolnej ręki', PRZ: 'Przetarg ofert' };

// Kind of vehicle as written by tax offices ("SAMOCHÓD OSOBOWY ...", "... ciągnik samochodowy, siodłowy").
// "Samochód ciężarowy" is not used as a category: offices also apply it to N1-registered SUVs and vans.
const KIND_RE = new RegExp(
  [
    'samoch[oó]d(?:\\s+(?:osobowy|ci[eę][zż]arowy|dostawczy|specjalny|ci[eę][zż]arowo-osobowy|osobowo-ci[eę][zż]arowy))?(?:\\s+wielozadaniowy)?',
    'ci[aą]gnik(?:\\s+(?:samochodowy|siod[lł]owy|rolniczy))?(?:[\\s,]+siod[lł]owy)?',
    'naczepa(?:\\s+ci[eę][zż]arowa)?',
    'przyczep(?:a|ka)(?:\\s+(?:ci[eę][zż]arowa|lekka|samochodowa))?',
    'motorower',
    'motocykl',
    'skuter',
    'quad',
  ].join('|'),
  'i',
);
const YEAR = '((?:19[5-9]|20[0-3])\\d)';

const integer = (s) => (s ? Number(String(s).replace(/\D/g, '')) || undefined : undefined);

/**
 * Splits a tax-office title ("SAMOCHÓD OSOBOWY OPEL ASTRA, rok prod. 2003, nr rej. WX12345") into a clean
 * vehicle name, a kind label (used as category), the year and – when given – engine size and power.
 */
export function parseTitle(raw) {
  let t = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d+_/, '')
    .replace(/\bdaimler\s*-?\s*chrysler\s*\(\s*mercedes(?:-benz)?\s*\)/i, 'Mercedes-Benz');
  const out = {};
  const take = (re, fn) => {
    const m = t.match(re);
    if (!m) return;
    fn(m);
    t = t.replace(m[0], ' ');
  };
  const setYear = (m) => (out.year ??= Number(m[1]));
  take(new RegExp(`[,;–-]?\\s*(?:\\br\\.\\s*prod\\.?|\\brok(?:\\s+prod(?:ukcji|\\.)?)?)\\s*:?\\s*${YEAR}\\s*(?:r\\b\\.?)?`, 'i'), setYear);
  if (!out.year) take(new RegExp(`[,;]?\\s*(?:\\bz\\s+)?\\b${YEAR}\\s*r(?:oku|ok|\\.)?(?=\\W|$)\\.?`, 'i'), setYear);
  take(/[,;]?\s*poj(?:\.|emno[sś][cć])?\s*(?:silnika)?\s*:?\s*(\d[\d\s]{2,5}\d)\s*(?:cm3|cm³|ccm|cm\b)?\.?/i, (m) => (out.engineCcm = integer(m[1])));
  // "o pojemności 2.0 HDI" – keep the litres, drop the words.
  t = t.replace(/[,;]?\s*(?:\bo\s+)?pojemno[sś]ci\s+(?=\d[.,]\d)/i, ' ');
  take(/[,;]?\s*(?:moc\s*:?\s*)?(\d{2,3})\s*kW\s*\(\s*(\d{2,3})\s*KM\s*\)/i, (m) => (out.powerKm = Number(m[2])));
  take(/[,;]?\s*(?:moc\s*:?\s*)?(\d{2,3})\s*KM\b/i, (m) => (out.powerKm ??= Number(m[1])));
  take(/[,;]?\s*\b(diesel|b[e]?nzyn[ay]?(?:\s*\+\s*lpg)?|lpg|hybryd[ay]|elektryczny)\b/i, (m) => {
    const f = m[1].toLowerCase();
    if (f.includes('lpg')) out.fuel = f.startsWith('b') ? 'Benzyna+LPG' : 'LPG';
    else out.fuel = { d: 'Diesel', b: 'Benzyna', h: 'Hybryda', e: 'Elektryczny' }[f[0]];
  });

  // Registration and body numbers are not part of the name.
  t = t.replace(/[,;]?\s*nr\.?\s*(?:rej(?:estracyjny|\.)?|nadw(?:ozia|\.)?|vin)\s*:?\s*[A-Z0-9 ]{4,17}?(?=[,;]|$)/gi, ' ');
  t = t.replace(/[,;]?\s*\bVIN\s*:?\s*[A-HJ-NPR-Z0-9]{17}\b/gi, ' ');

  const k = t.match(KIND_RE);
  if (k) {
    if (!/ci[eę][zż]arowy/i.test(k[0])) out.kind = k[0];
    t = t.replace(k[0], ' ');
  }
  const kindLabel = k ? k[0].charAt(0).toUpperCase() + k[0].slice(1).toLowerCase() : '';
  // "... marki Audi A4" – the make follows the word "marki".
  const marki = t.match(/\bmarki\s+/i);
  if (marki) t = t.slice(marki.index + marki[0].length);
  t = t.replace(/[,;]?\s*\bwielozadaniowy\b/gi, ' ');

  t = t
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.])/g, '$1')
    .replace(/[,;](\s*[,;])+/g, ',')
    .replace(/^[\s,;:.–-]+|[\s,;:–-]+$/g, '')
    .replace(/^([^\s,]+),\s*/, '$1 ');
  // A Polish plate left at the very end ("Toyota Avensis WPR 9035S").
  t = t.replace(/\s+[A-Z]{2,3}\s?\d[A-Z0-9]{3,4}$/, '');
  if (!out.year) {
    const m = t.match(new RegExp(`,?\\s${YEAR}$`));
    if (m) {
      out.year = Number(m[1]);
      t = t.slice(0, m.index);
    }
  }
  t = t.replace(/[\s,;:.–-]+$/, '').replace(/,\s*,/g, ',');
  return { ...out, title: t || kindLabel || String(raw ?? '').trim() };
}

const placeName = (s) => {
  const p = String(s ?? '').trim();
  if (!p) return undefined;
  if (p !== p.toUpperCase() && p !== p.toLowerCase()) return p;
  return titleCase(p.toLowerCase()).replace(/-(\p{L})/gu, (_, c) => `-${c.toUpperCase()}`);
};

function toRecord(a) {
  const { title, kind, year, engineCcm, powerKm, fuel } = parseTitle(a.title);
  const types = a.announcementTypeCodes ?? [];
  const code = types.find((c) => /RUCH$/.test(c)) ?? types[0] ?? '';
  const saleType = SALE_TYPES[code.slice(0, 3)] ?? 'Licytacja';
  const electronic = code.slice(3, 6) === 'ELE';
  const bid = a.highestBid ?? null;
  return {
    id: a.uuid,
    url: `${BASE}/announcements/${a.uuid}`,
    title,
    category: kind,
    year,
    engineCcm,
    powerKm,
    fuel,
    price: bid ?? a.startingPrice ?? undefined,
    priceLabel: bid != null ? 'Najwyższa oferta' : saleType === 'Licytacja' ? 'Cena wywołania' : 'Cena',
    saleType: electronic ? saleType : `${saleType} (w urzędzie)`,
    location: placeName(a.localization),
    // Traditional (on-site) auctions have only a start time.
    endDate: a.saleEndDateTime || a.saleBeginDateTime || undefined,
  };
}

export default {
  id: 'elicytacje-kas',
  name: 'eLicytacje KAS',
  url: `${BASE}/`,
  note: 'Licytacje urzędów skarbowych (Ministerstwo Finansów)',
  delayMs: 2500,
  async scrape({ http, log, maxPages }) {
    const out = [];
    const limit = Math.max(maxPages, 10);
    for (let page = 0; page < limit; page++) {
      const res = await http.request(`${API}/v1/announcement/external?page=${page}&size=${PAGE_SIZE}`, {
        headers: { Accept: 'application/json', Origin: 'https://elicytacje.mf.gov.pl', Referer: `${BASE}/search` },
        json: {
          sectionId: SECTION_MOVABLES,
          categoryId: CATEGORY_VEHICLES,
          filters: { electronicStateCode: ['WAITING', 'INPROGRESS'] },
        },
      });
      const body = await res.text();
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        throw new Error('Portal zwrócił stronę zabezpieczeń (Incapsula) zamiast danych – pominięto w tym przebiegu');
      }
      const items = data.content ?? [];
      for (const a of items) out.push(toRecord(a));
      log(`strona ${page + 1}/${data.totalPages ?? '?'}: ${items.length} ogłoszeń`);
      if (!items.length || page + 1 >= (data.totalPages ?? 0)) break;
    }
    return out;
  },
};
