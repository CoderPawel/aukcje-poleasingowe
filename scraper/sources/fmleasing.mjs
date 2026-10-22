/**
 * FM Leasing (fmleasing.pl) – leasing portal with a classifieds board for post-leasing assets
 * ("Baza ogłoszeń poleasingowych", Joomla + DJ-Classifieds). It does not run auctions itself;
 * the rest of its "Poleasingowe" section only links to the leasing companies' own sites.
 *
 * The 403 seen with plain curl is a User-Agent block; a browser UA (default in lib/http) is enough.
 * Category listings: /ogloszenia-poleasingowe/items/<id>-<alias> (server-rendered table, .dj-items-table2).
 * At the time of writing every category is empty ("W tej kategorii nie ma żadnych ogłoszeń"),
 * so the card parser below is written against DJ-Classifieds' standard table markup.
 */
import * as cheerio from 'cheerio';

const BASE = 'https://www.fmleasing.pl';

// Parent "Poleasingowa sprzedaż i aukcje" plus its sub-categories (lease transfers / new cars are skipped).
const CATEGORIES = [
  { path: '/ogloszenia-poleasingowe/items/8-sprzedaz-samochody-osobowe', category: 'Osobowe' },
  { path: '/ogloszenia-poleasingowe/items/9-sprzedaz-samochody-ciezarowe', category: 'Ciężarowe' },
  { path: '/ogloszenia-poleasingowe/items/10-sprzedaz-maszyny-urzadzenia', category: 'Maszyny' },
  { path: '/ogloszenia-poleasingowe/items/5-sprzedaz-aukcje', category: undefined },
];

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const abs = (href) => (href ? new URL(href, BASE).toString() : undefined);

function parseRow($, el, category) {
  const row = $(el);
  const link = row.find('.item_col.name a, .name a, h3 a').filter((_, a) => /\/ad\/|\/\d+[,-]/.test($(a).attr('href') || '')).first();
  const href = link.attr('href') || row.find('a[href]').first().attr('href');
  const title = clean(link.text()) || clean(row.find('.name, h3').first().text());
  if (!href || !title) return null;

  const url = abs(href);
  const desc = clean(row.find('.item_col.desc, .desc, .item_desc').first().text());
  const text = `${title} ${desc}`;
  const priceText = clean(row.find('.price, .item_col.price').first().text()) || text.match(/(\d[\d\s.,]*)\s*(zł|pln)/i)?.[0];
  const img = row.find('img').filter((_, i) => !/sort\.gif|no-image|blank/i.test($(i).attr('src') || '')).first();

  return {
    id: url.match(/\/(\d+)[,-][^/]*$/)?.[1],
    url,
    title,
    category,
    year: text.match(/\b(19[89]\d|20[0-4]\d)\b/)?.[1],
    mileage: text.match(/(\d[\d\s.]*)\s*km\b/i)?.[0],
    price: priceText,
    priceGross: /netto/i.test(text) ? false : /brutto/i.test(text) ? true : undefined,
    saleType: /aukcj|licytac/i.test(text) ? 'Licytacja' : 'Oferta',
    location: clean(row.find('.region, .item_col.region, .location').first().text()) || undefined,
    image: abs(img.attr('src')),
  };
}

function nextPageUrl($) {
  const next = $('.pagination a, .pagination-next a, a[rel="next"]')
    .filter((_, a) => $(a).attr('rel') === 'next' || /następn|dalej|next|»|›/i.test(`${$(a).text()} ${$(a).attr('title') || ''}`))
    .first()
    .attr('href');
  return next ? abs(next) : null;
}

export default {
  id: 'fmleasing',
  name: 'FM Leasing',
  url: 'https://www.fmleasing.pl/',
  // The board is often empty; the module throws itself when the page structure is unrecognised.
  allowEmpty: true,
  note:
    'FmLeasing.pl to portal o leasingu z tablicą ogłoszeń poleasingowych (nie prowadzi własnych aukcji). ' +
    'W ostatnim sprawdzeniu baza ogłoszeń była pusta – pozostała część sekcji „Poleasingowe” to linki do stron firm leasingowych.',
  async scrape({ http, log, maxPages }) {
    const out = [];
    const seen = new Set();

    for (const { path, category } of CATEGORIES) {
      let url = BASE + path;
      for (let page = 1; url && page <= maxPages; page++) {
        const html = await http.text(url);
        const $ = cheerio.load(html);
        const hasList = $('.dj-items-table2, #dj-classifieds .items').length > 0;
        if (!hasList && !$('.no_results').length) throw new Error(`Nieoczekiwana struktura strony: ${url}`);

        $('.dj-items-table2 .item_row:not(.item_header), #dj-classifieds .items .item').each((_, el) => {
          try {
            const rec = parseRow($, el, category);
            const key = rec?.id ?? rec?.url;
            if (rec && !seen.has(key)) {
              seen.add(key);
              out.push(rec);
            }
          } catch (e) {
            log(`pominięto ogłoszenie: ${e.message}`);
          }
        });
        const next = nextPageUrl($);
        url = next && next !== url ? next : null;
      }
    }

    log(`${out.length} ogłoszeń`);
    return out;
  },
};
