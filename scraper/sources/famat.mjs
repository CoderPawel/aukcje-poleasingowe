/**
 * Famat Aukcje (famataukcje.pl) – server-rendered listing pages, one per subcategory:
 *   /oferty/<section>/strona-<n>/?subcat=<id>
 * Cards already contain title, year, fuel, mileage, ccm, gearbox, price and end date,
 * so detail pages are not fetched.
 */
import * as cheerio from 'cheerio';

const BASE = 'https://famataukcje.pl';

// "Przemysłowe" (10) and "Inne" (12) machinery subcategories are skipped – they contain
// non-vehicle items (medical devices, production lines, ...).
const SUBCATEGORIES = [
  { section: 'transport', id: 2, category: 'Osobowe' },
  // Site label is "Ciężarowe i dostawcze"; the normalizer refines known van models to "dostawcze".
  { section: 'transport', id: 3, category: 'Ciężarowe' },
  { section: 'transport', id: 4, category: 'Naczepy i przyczepy' },
  { section: 'transport', id: 5, category: 'Autobusy' },
  { section: 'transport', id: 6, category: 'Motocykle' },
  { section: 'maszyny', id: 8, category: 'Maszyny budowlane' },
  { section: 'maszyny', id: 9, category: 'Maszyny rolnicze i leśne' },
  { section: 'maszyny', id: 11, category: 'Wózki widłowe' },
];

const text = (el) => el.text().replace(/\s+/g, ' ').trim();

/** "55 450 km" -> 55450 (passed as a number: the generic parser treats the "k" of "km" as "thousands"). */
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

/** "2026/10/28 12:00:00" from the inline jQuery countdown script. */
function endDate(card) {
  const m = (card.find('.auction_counter script').html() || '').match(/countdown\('(\d{4})\/(\d{2})\/(\d{2}) ([\d:]+)'/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}` : undefined;
}

function parseCard($, el, category) {
  const card = $(el);
  const url = card.attr('href');
  const h3 = card.find('h3').first();
  const title = text(h3.clone().children().remove().end());
  if (!url || !title) return null;

  const rec = { id: url.match(/\/oferta\/(\d+)/)?.[1], url, title, category };

  // Grey subtitle spans: "1 968 cm3," / model name / gearbox – order varies, so classify by content.
  h3.find('p span').each((_, s) => {
    const v = text($(s)).replace(/,$/, '');
    if (/cm3|cm³/i.test(v)) rec.engineCcm = integer(v.replace(/cm.*$/i, ''));
    else if (/automat|manual|półautomat/i.test(v)) rec.gearbox = v;
    else if (v) rec.model ??= v;
  });

  card.find('.vehicle-info .single').each((_, s) => {
    const icon = $(s).find('img').attr('src') || '';
    const v = text($(s));
    if (icon.includes('calendar')) rec.year = v;
    else if (icon.includes('fuel')) rec.fuel = v;
    else if (icon.includes('clock')) rec.mileage = integer(v);
  });

  // "Seller name, City"
  const seller = text(card.find('.vehicle_seller_info p').first());
  if (seller.includes(',')) rec.location = seller.slice(seller.lastIndexOf(',') + 1).trim();

  rec.price = text(card.find('.price .numbers'));
  const vat = text(card.find('.price .currency .smaller')).toLowerCase();
  if (vat) rec.priceGross = vat.includes('brutto');

  const type = text(card.find('.auction_type .semibold')).toLowerCase();
  if (type.includes('kup teraz')) {
    rec.saleType = 'Kup teraz';
    rec.priceLabel = 'Cena kup teraz';
  } else if (type) {
    rec.saleType = 'Licytacja';
    rec.priceLabel = 'Aktualna cena';
  }

  rec.endDate = endDate(card);
  rec.image = card.find('.picture img').first().attr('src');
  return rec;
}

export default {
  id: 'famat',
  name: 'Famat Aukcje',
  url: `${BASE}/`,
  async scrape({ http, log, maxPages }) {
    const out = [];
    for (const sub of SUBCATEGORIES) {
      let pages = 1;
      for (let page = 1; page <= Math.min(pages, maxPages); page++) {
        const html = await http.text(`${BASE}/oferty/${sub.section}/strona-${page}/?subcat=${sub.id}`);
        const $ = cheerio.load(html);
        if (page === 1) pages = lastPage($);
        const cards = $('#listing-desktop a.single_auction');
        if (!cards.length) break;
        cards.each((_, el) => {
          try {
            const rec = parseCard($, el, sub.category);
            if (rec) out.push(rec);
          } catch (e) {
            log(`pominięto kartę (${sub.category}): ${e.message}`);
          }
        });
      }
      log(`${sub.category}: ${pages} str.`);
    }
    log(`${out.length} rekordów`);
    return out;
  },
};
