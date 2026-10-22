/**
 * AutoPrzetarg (autoprzetarg.pl) – ASP.NET MVC site, server-rendered listing:
 *   /kategoria/Pojazdy1?page=<n>  (12 cards per page, "Wyszukano N ofert" header)
 * Cards contain year, mileage, ccm/KM, fuel, VIN, location, current bid and end date.
 * The subcategory ("Samochody-osobowe", "Samochody-dostawcze", ...) is the last segment of the offer URL.
 * The "Maszyny" category is skipped – it is mostly non-vehicle equipment (coffee machines, welders, ...).
 */
import * as cheerio from 'cheerio';

const BASE = 'https://autoprzetarg.pl';
const LISTING = `${BASE}/kategoria/Pojazdy1`;
const PER_PAGE = 12;

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
      .replace(/\s+\d[\d,.]*\s*(ccm|cm3)\s*\/\s*\d+\s*KM\s*$/i, '')
      .replace(/\s*\/\s*\d+\s*KM\s*$/i, ''),
  );
}

/** "80-900 Pruszcz Gdański, ul. Handlowa 4" -> "Pruszcz Gdański" */
function city(location) {
  return clean(
    clean(location)
      .split(',')[0]
      .replace(/\s+ul\..*$/i, '')
      .replace(/^\d{2}-\d{3}\s+/, ''),
  );
}

function categoryFromUrl(url) {
  const slug = url.split(',').pop();
  try {
    return decodeURIComponent(slug).replace(/-/g, ' ');
  } catch {
    return slug.replace(/-/g, ' ');
  }
}

/** Reads "<b>Label:</b> value<br>" pairs from the card. */
function specs($, card) {
  const out = {};
  card.find('p b').each((_, b) => {
    let v = '';
    for (let n = b.nextSibling; n && n.name !== 'b' && n.name !== 'br'; n = n.nextSibling) v += $(n).text();
    out[clean($(b).text()).replace(/:$/, '')] = clean(v);
  });
  return out;
}

function parseCard($, el) {
  const card = $(el);
  const url = card.attr('href');
  const rawTitle = clean(card.find('h3').first().text());
  if (!url || !rawTitle) return null;

  const s = specs($, card);
  // "1798,00 cm3 / 98 KM"
  const [ccm, km] = (s['Pojemność silnika'] || '').split('/');
  const priceBox = card.find('.section-list-auctions-block-item-con-box-info-top');

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
    vin: s['VIN'] || undefined,
    location: city(s['Lokalizacja']) || undefined,
    price: clean(priceBox.find('.section-list-auctions-price').text()),
    // Every checked offer page states "taxcost = 'Netto'" (VAT 23% added on top).
    priceGross: false,
    priceLabel: clean(priceBox.find('.section-list-auctions-title').text()).replace(/:$/, '') || 'Aktualna cena aukcji',
    saleType: 'Licytacja',
    endDate: card.find('input[name=auctionEndDate]').attr('value'),
    image: card.find('img').first().attr('src'),
  };
}

export default {
  id: 'autoprzetarg',
  name: 'AutoPrzetarg',
  url: `${BASE}/`,
  async scrape({ http, log, maxPages }) {
    const out = [];
    let pages = maxPages;
    for (let page = 1; page <= Math.min(pages, maxPages); page++) {
      const html = await http.text(page === 1 ? LISTING : `${LISTING}?page=${page}`);
      const $ = cheerio.load(html);
      if (page === 1) {
        const total = +($('body').text().match(/Wyszukano\s+(\d+)\s+ofert/)?.[1] ?? NaN);
        if (Number.isFinite(total)) {
          pages = Math.ceil(total / PER_PAGE);
          log(`${total} ofert (${pages} str.)`);
        }
      }
      const cards = $('a.section-list-auctions-block-item');
      if (!cards.length) break;
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
