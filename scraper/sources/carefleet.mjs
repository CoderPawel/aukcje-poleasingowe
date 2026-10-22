/**
 * Carefleet – two sales channels:
 *  1. poleasingowe.carefleet.pl – fixed-price ("Kup teraz") shop, server-rendered:
 *       /oferty/strona-<n>/?kategoria=osobowe|dostawcze|ciezarowe
 *     Card markup was taken from Wayback Machine snapshots (2026) because the site answered
 *     every request with a 503 "TRWAJĄ PRACE SERWISOWE" maintenance page when this was written.
 *  2. Carefleet auctions hosted on aukcje.efl.com.pl (/AuctionList/Carefleet/...), parsed by
 *     _efl-platform.mjs.
 * Either channel may fail on its own; the scrape only throws when both fail.
 */
import * as cheerio from 'cheerio';
import { scrapeEfl } from './_efl-platform.mjs';

const SHOP = 'https://poleasingowe.carefleet.pl';

const SHOP_CATEGORIES = [
  { slug: 'osobowe', category: 'Osobowe' },
  { slug: 'dostawcze', category: 'Dostawcze' },
  { slug: 'ciezarowe', category: 'Ciężarowe' },
];

const EFL_CATEGORIES = [
  { slug: 'Carefleet/Osobowe', category: 'Osobowe' },
  { slug: 'Carefleet/Dostawcze', category: 'Dostawcze' },
  // "Pozostałe" mixes trucks and other vehicles, so it is left to the title-based classifier.
  { slug: 'Carefleet/Pozostale', category: undefined },
  { slug: 'Carefleet', category: undefined },
];

const text = (el) => el.text().replace(/\s+/g, ' ').trim();

/** "23 285 km" -> 23285 (passed as a number: the generic parser treats the "k" of "km" as "thousands"). */
function integer(s) {
  const n = parseInt(String(s ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

function lastPage($) {
  const pages = $('.pagination a')
    .map((_, a) => +($(a).attr('href') || '').match(/strona-(\d+)/)?.[1] || 0)
    .get();
  return Math.max(1, ...pages);
}

function parseShopCard($, el, category) {
  const card = $(el);
  const url = card.find('a[href*="/oferta/"]').first().attr('href');
  const title = text(card.find('.auction-car-name').first());
  if (!url || !title) return null;

  const rec = {
    id: `shop-${url.match(/\/oferta\/(\d+)/)?.[1]}`,
    url: new URL(url, SHOP).toString(),
    title,
    category,
    image: card.find('.picture img').first().attr('src'),
    saleType: 'Kup teraz',
  };
  if (rec.image) rec.image = new URL(rec.image, SHOP).toString();

  card.find('.vehicle-info .single').each((_, s) => {
    const icon = $(s).find('img').attr('src') || '';
    const v = text($(s));
    if (icon.includes('calendar')) rec.year = v;
    else if (icon.includes('fuel')) rec.fuel = v;
    else if (icon.includes('clock')) rec.mileage = integer(v);
  });

  const price = card.find('.options .price').first();
  rec.price = text(price.find('.numbers').first());
  rec.priceLabel = text(price.find('.desc_p').first()).replace(/\s*(za)?:$/i, '') || 'Kup teraz';
  const currency = text(price.find('.currency').first());
  if (/eur/i.test(currency)) rec.currency = 'EUR';
  if (/brutto|netto/i.test(currency)) rec.priceGross = /brutto/i.test(currency);
  return rec;
}

async function scrapeShop({ http, log, maxPages }) {
  // Probe without the helper's 5xx retries so a maintenance page is reported quickly and clearly.
  const probe = await http.request(`${SHOP}/`, { raw: true });
  if (!probe.ok) {
    const body = await probe.text();
    const reason = /prace serwisowe/i.test(body) ? 'prace serwisowe' : body.slice(0, 80);
    throw new Error(`HTTP ${probe.status} (${reason})`);
  }
  await probe.arrayBuffer().catch(() => {});

  const out = [];
  for (const cat of SHOP_CATEGORIES) {
    let pages = 1;
    let count = 0;
    for (let page = 1; page <= Math.min(pages, maxPages); page++) {
      const html = await http.text(`${SHOP}/oferty/strona-${page}/?kategoria=${cat.slug}&price_type=1&sort=price-desc`);
      const $ = cheerio.load(html);
      if (page === 1) pages = lastPage($);
      const cards = $('.single-auction');
      if (!cards.length) break;
      cards.each((_, el) => {
        try {
          const rec = parseShopCard($, el, cat.category);
          if (rec) {
            out.push(rec);
            count++;
          }
        } catch (e) {
          log(`pominięto kartę (${cat.slug}): ${e.message}`);
        }
      });
    }
    log(`sklep ${cat.slug}: ${count}`);
  }
  return out;
}

export default {
  id: 'carefleet',
  name: 'Carefleet Poleasingowe',
  url: `${SHOP}/`,
  note:
    'Sklep poleasingowe.carefleet.pl odpowiadał 503 („Trwają prace serwisowe”) podczas tworzenia scrapera – ' +
    'jego parser oparto na archiwalnych kopiach strony. Aukcje Carefleet są dodatkowo pobierane z aukcje.efl.com.pl.',
  async scrape({ http, log, maxPages }) {
    const out = [];
    const errors = [];
    try {
      out.push(...(await scrapeShop({ http, log, maxPages })));
    } catch (e) {
      errors.push(`sklep: ${e.message}`);
      log(`sklep poleasingowe.carefleet.pl niedostępny: ${e.message}`);
    }
    try {
      out.push(...(await scrapeEfl({ http, log, maxPages, categories: EFL_CATEGORIES, detailLimit: 150 })));
    } catch (e) {
      errors.push(`aukcje EFL: ${e.message}`);
      log(`aukcje Carefleet na EFL: błąd ${e.message}`);
    }
    if (!out.length && errors.length) throw new Error(errors.join('; '));
    log(`${out.length} rekordów`);
    return out;
  },
};
