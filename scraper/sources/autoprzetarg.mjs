/**
 * AutoPrzetarg (autoprzetarg.pl) – ASP.NET MVC site, server-rendered listing:
 *   /kategoria/Pojazdy1?page=<n>  (9 cards per page; the pageSize parameter is ignored)
 * Each `.auction-card` has a label/value table (year, ccm/KM, fuel, mileage), VIN, seller, location,
 * current bid and the auction end as an ISO timestamp (`data-end-time`).
 * The subcategory ("Samochody-osobowe", "Samochody-dostawcze", ...) is the last segment of the offer URL.
 * The "Maszyny" category is skipped – it is mostly non-vehicle equipment (coffee machines, welders, ...).
 */
import * as cheerio from 'cheerio';

const BASE = 'https://autoprzetarg.pl';
const LISTING = `${BASE}/kategoria/Pojazdy1`;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function integer(s) {
  const n = parseInt(String(s ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** First number in the string, Polish decimal comma allowed: "1798,00 cm3" -> 1798. */
function leadingNumber(s) {
  const m = String(s ?? '').match(/\d[\d\s]*(?:[.,]\d+)?/);
  return m ? Math.round(parseFloat(m[0].replace(/\s/g, '').replace(',', '.'))) : undefined;
}

/** Titles are upper-case ("TOYOTA COROLLA"); capitalize plain words, keep short/alphanumeric tokens (BMW, HDI, XF480FT). */
function prettyTitle(s) {
  if (s !== s.toUpperCase()) return s;
  return s.replace(/(?<![\p{L}\d])\p{Lu}{4,}(?![\p{L}\d])/gu, (w) => w[0] + w.slice(1).toLowerCase());
}

/** Titles end with the engine spec repeated ("... 1798,00 cm3 / 98 KM"), which would pollute model detection. */
function stripEngineSuffix(title) {
  return clean(
    title
      .replace(/\s+\d[\d,.]*\s*(ccm|cm3)(\s*\/\s*\d+\s*(KM|kW))?\s*$/i, '')
      .replace(/\s*\/\s*\d+\s*(KM|kW)\s*$/i, ''),
  );
}

/** "Łyszkowice, Targowa 15" / "80-900 Pruszcz Gdański, ul. Handlowa 4" / "NATOLIN" -> city */
function city(location) {
  const parts = clean(location).split(',').map(clean).filter((p) => p && !/^ul\.?\s*/i.test(p));
  const c = clean((parts[0] || '').replace(/\s+ul\..*$/i, '').replace(/^\d{2}-\d{3}\s+/, ''));
  return c === c.toUpperCase() ? c.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : c;
}

function categoryFromUrl(url) {
  const slug = url.split(',').pop();
  try {
    return decodeURIComponent(slug).replace(/-/g, ' ');
  } catch {
    return slug.replace(/-/g, ' ');
  }
}

/** Reads the "Label:" / value rows of the card's data table. */
function specs($, card) {
  const out = {};
  card.find('table.data-table tr').each((_, tr) => {
    const label = clean($(tr).find('td.label').text()).replace(/:$/, '');
    if (label) out[label] = clean($(tr).find('td.value').text());
  });
  return out;
}

function lastPage($) {
  const pages = $('.pagination a.page-link')
    .map((_, a) => +($(a).attr('href') || '').match(/[?&]page=(\d+)/)?.[1] || 0)
    .get();
  return Math.max(1, ...pages);
}

function parseCard($, el) {
  const card = $(el);
  const link = card.find('a[href^="/aukcja/"]').first();
  const url = link.attr('href');
  const rawTitle = clean(card.find('h3').first().text());
  if (!url || !rawTitle) return null;

  const s = specs($, card);
  // "2287,00 cm3 / 136 KM"
  const [ccm, km] = (s['Pojemność'] || s['Pojemność silnika'] || '').split('/');
  const location = clean(card.find('.location-info').filter((_, e) => /Lokalizacja/i.test($(e).text())).find('strong').text());
  const image = (card.find('a.card-img').attr('style') || '').match(/url\(['"]?([^'")]+)['"]?\)/)?.[1];

  return {
    id: url.split(',').at(-2),
    url,
    title: prettyTitle(stripEngineSuffix(rawTitle) || rawTitle),
    category: categoryFromUrl(url),
    year: s['Rok produkcji'],
    mileage: integer(s['Przebieg']),
    fuel: s['Rodzaj paliwa'] || undefined,
    engineCcm: leadingNumber(ccm),
    powerKm: leadingNumber(km),
    vin: clean(card.find('.vin-box').text()).replace(/^VIN:\s*/i, '') || undefined,
    location: city(location) || undefined,
    price: clean(card.find('.price-value').text()),
    // Every checked offer page states "taxcost = 'Netto'" (VAT 23% added on top).
    priceGross: false,
    priceLabel: 'Aktualna cena aukcji',
    saleType: 'Licytacja',
    endDate: card.find('[data-end-time]').attr('data-end-time'),
    image,
  };
}

export default {
  id: 'autoprzetarg',
  name: 'AutoPrzetarg',
  url: `${BASE}/`,
  async scrape({ http, log, maxPages }) {
    const out = [];
    // Pages are small (9 cards), so allow twice the usual page budget.
    const limit = maxPages * 2;
    let pages = limit;
    for (let page = 1; page <= Math.min(pages, limit); page++) {
      const $ = cheerio.load(await http.text(`${LISTING}?page=${page}`));
      if (page === 1) {
        pages = lastPage($);
        log(`${pages} str.`);
      }
      const cards = $('.auctions-grid .auction-card');
      if (!cards.length) {
        if (page === 1) throw new Error('Nie znaleziono kart aukcji (.auction-card) – zmieniła się struktura strony');
        break;
      }
      cards.each((_, el) => {
        try {
          const rec = parseCard($, el);
          if (rec) out.push(rec);
        } catch (e) {
          log(`pominięto kartę: ${e.message}`);
        }
      });
    }
    log(`${out.length} rekordów`);
    return out;
  },
};
