/**
 * PKO Leasing Aukcje (aukcje.pkoleasing.pl) – server-rendered listing, one URL per (sub)category:
 *   /pl/auctions/list/pub/all/<category>[/<subcategory>]?page=<n>
 * Page size is controlled by the `auctions_list_page_size` cookie (site max is 30).
 * Cards contain title, year, fuel, mileage, price, end date, location and auction type,
 * so detail pages are not fetched. Prices are net ("netto" on the detail pages).
 */
import * as cheerio from 'cheerio';

const BASE = 'https://aukcje.pkoleasing.pl';
const PAGE_SIZE = 30;

// "Uszkodzone" (damaged) is a cross-category flag duplicating vehicles, so it is not listed.
// Skipped as non-vehicles: "Sprzęt budowlany" (mostly tools – lasers, thread cutters, cameras),
// industrial machines, electronics, medical equipment and real estate.
const CATEGORIES = [
  { path: 'vehicles/ecr_cartypess', category: 'Osobowe' },
  { path: 'vehicles/ecr_carbig', category: 'Dostawcze' },
  { path: 'vehicles/trucks', category: 'Ciężarowe' },
  { path: 'vehicles/ECR_other', category: undefined },
  { path: 'ecr_trailers1', category: 'Naczepy i przyczepy' },
  { path: 'ecr_motorcycles', category: 'Motocykle' },
  { path: 'ecr_bus', category: 'Autobusy' },
  { path: 'ecr_agricultural', category: 'Maszyny rolnicze' },
];

const text = (el) => el.text().replace(/\s+/g, ' ').trim();

/** "96591 km" -> 96591 (passed as a number: the generic parser treats the "k" of "km" as "thousands"). */
function integer(s) {
  const n = parseInt(String(s ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** "Znaleziono 65 aukcję/aukcji spełniających kryteria" -> 65 */
function totalCount($) {
  const m = $('body').text().match(/Znaleziono\s+(\d+)\s+aukcj/);
  return m ? +m[1] : null;
}

/** Reads "Label:" / value span pairs from the details block. */
function specs($, card) {
  const out = {};
  card.find('[id^="auction-details-"] span.bold').each((_, b) => {
    const label = text($(b)).replace(/:$/, '').toLowerCase();
    out[label] = text($(b).next('span'));
  });
  return out;
}

function parseCard($, el, category) {
  const card = $(el);
  const link = card.find('h2 a').first();
  const url = link.attr('href');
  const title = text(link);
  if (!url || !title) return null;

  const rec = {
    id: (card.attr('aria-labelledby') || '').match(/title-(\d+)/)?.[1] ?? url.match(/\/details\/[^/]+\/([^/?]+)/)?.[1],
    url,
    title,
    category,
    image: card.find('img').first().attr('src'),
    priceGross: false,
  };

  const s = specs($, card);
  rec.year = s['rok produkcji'];
  rec.fuel = s['paliwo'];
  if (s['przebieg']) rec.mileage = integer(s['przebieg']);

  // First ".price.value" is the current price; a second one (inside the "Kup teraz" box) is the buy-now price.
  const priceBox = card.find('[id^="price-info-"]');
  const current = priceBox.find('span.price.value').first();
  rec.price = text(current.clone().children('small').remove().end());
  rec.priceLabel = text(priceBox.find('.price.header')).replace(/\s*:$/, '') || undefined;

  const type = text(card.find('.text-lg-right .bold').first()).toLowerCase();
  const hasBuyNow = /kup teraz/i.test(text(priceBox));
  if (type.includes('licytacja')) rec.saleType = hasBuyNow ? 'Licytacja / Kup teraz' : 'Licytacja';
  else if (type.includes('ofert')) rec.saleType = 'Oferta';
  else if (type) rec.saleType = type.charAt(0).toUpperCase() + type.slice(1);

  // "(Data zakończenia: 23.10.2026)" – the listing only shows the day.
  rec.endDate = card.text().match(/Data zakończenia:\s*([\d.]+(?:\s+\d{1,2}:\d{2})?)/)?.[1];
  rec.location = text(card.find('.ico-marker').first().next('span')) || undefined;
  return rec;
}

export default {
  id: 'pkoleasing',
  name: 'PKO Leasing Aukcje',
  url: `${BASE}/`,
  async scrape({ http, log, maxPages }) {
    http.jar.cookies.set('auctions_list_page_size', String(PAGE_SIZE));
    const out = [];
    const seen = new Set();
    for (const cat of CATEGORIES) {
      let pages = 1;
      let count = 0;
      for (let page = 1; page <= Math.min(pages, maxPages); page++) {
        const html = await http.text(`${BASE}/pl/auctions/list/pub/all/${cat.path}?page=${page}`);
        const $ = cheerio.load(html);
        if (page === 1) {
          const total = totalCount($);
          if (total == null && !$('article.list-item').length && !$('#topsearchform').length)
            throw new Error(`Nieoczekiwana struktura strony listy (${cat.path})`);
          pages = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE));
        }
        const cards = $('article.list-item');
        if (!cards.length) break;
        cards.each((_, el) => {
          try {
            const rec = parseCard($, el, cat.category);
            if (rec && !seen.has(rec.id)) {
              seen.add(rec.id);
              out.push(rec);
              count++;
            }
          } catch (e) {
            log(`pominięto kartę (${cat.path}): ${e.message}`);
          }
        });
      }
      log(`${cat.category ?? cat.path}: ${count}`);
    }
    log(`${out.length} rekordów`);
    return out;
  },
};
