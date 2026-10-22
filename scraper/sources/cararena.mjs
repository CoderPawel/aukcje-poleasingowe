/**
 * CarArena (cararena.pl) – online auctions of post-leasing / fleet vehicles.
 *
 * The listing page loads cards through an XHR endpoint that returns JSON with the
 * rendered card HTML: GET /xhr/auctions?offset=&per_page=&sort_by=&sort_descasc=
 * (response: { response: html, auction_count, endResult, ... }).
 * Each card carries most data in data-* attributes plus a labelled info box.
 */
import * as cheerio from 'cheerio';

const BASE = 'https://cararena.pl';
const PER_PAGE = 100;

/** Category slug used in the card's location link (/aukcje/<slug>/l-<city>) -> label. */
const CATEGORIES = {
  'samochody-osobowe': 'Osobowe',
  'samochody-dostawcze': 'Dostawcze',
  'samochody-ciezarowe': 'Ciężarowe',
  'naczepy-i-przyczepy': 'Naczepy i przyczepy',
  motocykle: 'Motocykle',
  'maszyny-budowlane': 'Maszyny budowlane',
  'maszyny-rolnicze': 'Maszyny rolnicze',
  'maszyny-specjalistyczne': 'Maszyny specjalistyczne',
  'wozki-widlowe': 'Wózki widłowe',
  inne: 'Inne',
};

const FUEL_SLUGS = new Set(['gasoline', 'diesel', 'electric', 'hybrid', 'hydrogen', 'lpg', 'cng', 'benzyna', '0']);

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const slugify = (s) =>
  clean(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * The offer URL slug is "<id>-<brand>-<model>-<version>-<fuel>-<year>"; the listing only shows
 * "brand model", so the version is recovered from the slug (lowercase, best effort).
 */
function versionFromUrl(url, name) {
  let slug = (url || '').split('/').pop() || '';
  slug = slug.replace(/^\d+-/, '').replace(/-\d{4}$/, '');
  const prefix = slugify(name);
  if (prefix && slug.startsWith(prefix)) slug = slug.slice(prefix.length);
  const parts = slug.split('-').filter(Boolean);
  if (FUEL_SLUGS.has(parts.at(-1))) parts.pop();
  // The model name is often repeated right after brand+model ("stelvio-stelvio-2-0-...").
  const nameTokens = new Set(prefix.split('-'));
  while (parts.length && nameTokens.has(parts[0]) && !/^\d+$/.test(parts[0])) parts.shift();
  const version = parts
    .join('-')
    // restore decimals: "1-5-tsi" -> "1.5 tsi", "66-5kwh" -> "66.5kwh"
    .replace(/(^|-)(\d{1,2})-(\d)(?=[a-z]*(?:-|$))/g, '$1$2.$3')
    .replace(/-/g, ' ');
  return version || undefined;
}

const gearboxFromVersion = (version) =>
  /\b(aut|automat|dsg|s tronic|steptronic|cvt|tiptronic)\b/.test(version || '') ? 'Automatyczna' : undefined;

/** Reads the "label: value" rows of the card's info box (Rok produkcji, Przebieg, Paliwo, ...). */
function infoRows($, card) {
  const rows = {};
  card.find('.offer-item__info-row').each((_, el) => {
    const label = clean($(el).find('p').first().text()).replace(/:$/, '').toLowerCase();
    if (label) rows[label] = clean($(el).find('b').first().text());
  });
  return rows;
}

function parseCard($, el) {
  const card = $(el);
  const id = card.attr('data-auction-item-id');
  const titleLink = card.find('a.offers-item-thumb').first();
  const url = card.attr('data-url') || clean(titleLink.attr('href'));
  const name = clean(card.attr('data-name')) || clean(titleLink.text());
  // Machines without a known make are listed as "Other <maker> <model>".
  const title = name.replace(/^Other\s+/i, '');
  if (!url || !title) return null;

  const info = infoRows($, card);
  const locLink = card.find('.offers-item__location a').first();
  const catSlug = (locLink.attr('href') || '').match(/\/aukcje\/([a-z-]+)\/l-/)?.[1];
  const priceEl = card.find('.price[data-price-main]').first();
  const priceType = priceEl.attr('data-price-type');
  const buyNow = Number(card.attr('data-buy-now-price')) || 0;
  const status = card.attr('data-auction-status');
  const image = card.find('[data-img-thumb]').first().attr('data-img-thumb') || card.attr('data-thumb');
  // Some sellers hide prices from guests: data-price="Price is hidden. Log in to view price."
  const rawPrice = card.attr('data-price') || clean(priceEl.text());
  const price = /^\d+(\.\d+)?$/.test(rawPrice) ? Number(rawPrice) : undefined;
  const version = versionFromUrl(url, name);

  return {
    id,
    url,
    title,
    version,
    category: CATEGORIES[catSlug] ?? (catSlug ? catSlug.replace(/-/g, ' ') : undefined),
    year: info['rok produkcji'],
    mileage: info['przebieg'],
    fuel: info['paliwo'],
    gearbox: gearboxFromVersion(version),
    price,
    priceGross: price && priceType === 'gross' ? true : price && priceType === 'net' ? false : undefined,
    priceLabel: !price ? 'Cena po zalogowaniu' : status === 'idle' ? 'Cena wywoławcza' : 'Aktualna cena',
    saleType: buyNow > 0 ? 'Licytacja / Kup teraz' : 'Licytacja',
    location: clean(locLink.text()) || info['lokalizacja'],
    endDate: card.attr('data-date-end') || undefined,
    image: image ? image.trim() : undefined,
  };
}

export default {
  id: 'cararena',
  name: 'CarArena',
  url: 'https://cararena.pl/',
  async scrape({ http, log, maxPages }) {
    const out = [];
    const seen = new Set();
    let total = Infinity;

    for (let page = 0; page < maxPages && page * PER_PAGE < total; page++) {
      const params = new URLSearchParams({
        offset: String(page * PER_PAGE),
        per_page: String(PER_PAGE),
        sort_by: 'auction_finish',
        sort_descasc: 'asc',
        include_from_abroad: 'true',
      });
      const data = await http.json(`${BASE}/xhr/auctions?${params}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE}/aukcje` },
      });
      if (typeof data?.response !== 'string') throw new Error('Nieoczekiwana odpowiedź /xhr/auctions');
      total = Number(data.auction_count) || 0;

      const $ = cheerio.load(data.response);
      let added = 0;
      $('.offers-item[data-auction-item-id]').each((_, el) => {
        try {
          const rec = parseCard($, el);
          if (rec && !seen.has(rec.id)) {
            seen.add(rec.id);
            out.push(rec);
            added++;
          }
        } catch (e) {
          log(`pominięto kartę: ${e.message}`);
        }
      });
      if (!added) break;
    }

    log(`${out.length} rekordów (serwis podaje ${total === Infinity ? '?' : total})`);
    return out;
  },
};
