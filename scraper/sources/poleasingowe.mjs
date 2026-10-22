/**
 * Poleasingowe.pl – auction platform for post-leasing assets (ECR / "eCarRemarketing" engine).
 *
 * No JSON API; listings are server-rendered HTML:
 *   /pl/auctions/list/pub/all/<main category>?list_pagesize=20&page=N[&procsubcat=<sub category>]
 * The server caps the page size at 20. Passenger cars, vans and trucks share the "vehicles" main
 * category and are split with the `procsubcat` filter, so each sub-listing gets its own category.
 * Listing prices are net (the offer pages show "netto" next to the same amount).
 */
import * as cheerio from 'cheerio';
import { detectBrand } from '../lib/normalize.mjs';

const BASE = 'https://poleasingowe.pl';
const PAGE_SIZE = 20;

// Medical / industrial equipment and "other" (printers, IT) categories are not vehicles and are skipped.
const LISTINGS = [
  { main: 'vehicles', sub: 'ecr_cartypess', category: 'Osobowe' },
  { main: 'vehicles', sub: 'ecr_carbig', category: 'Dostawcze' },
  { main: 'vehicles', sub: 'trucks', category: 'Ciężarowe' },
  { main: 'vehicles', sub: 'ECR_other', category: undefined },
  { main: 'ecr_bus', category: 'Autobusy' },
  { main: 'ecr_trailers1', category: 'Naczepy i przyczepy' },
  { main: 'ecr_motorcycles', category: 'Motocykle' },
  { main: 'ecr_machinery', category: 'Maszyny budowlane' },
  { main: 'ecr_agricultural', category: 'Maszyny rolnicze' },
];

// Vehicle titles are "<MAKE> <model> <BODY>", e.g. "AUDI Q3 35 TFSI SUV", "MAN TGX CIĄGNIK SIODŁOWY".
const BODY_SUFFIX =
  /\b(suv|sedan|kombi|hatchback|liftback|minivan|van|pick-up|coupe|kabriolet|sportowy|furgon blaszak|furgon|ciągnik siodłowy|plandeka|skrzynia|kontener|chłodnia\/izoterma|chłodnia z agregatem|chłodnia|izoterma|solówka|autolaweta|pomoc drogowa|specjalistyczny|wywrotka|bus)$/i;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** "CIĄGNIK SIODŁOWY" -> "Ciągnik siodłowy"; short acronyms ("SUV") stay as they are. */
function capitalize(s) {
  const v = clean(s);
  if (!v || v.length <= 3) return v || undefined;
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

function listingUrl({ main, sub }, page) {
  const params = new URLSearchParams({ list_pagesize: String(PAGE_SIZE), page: String(page) });
  if (sub) params.set('procsubcat', sub);
  return `${BASE}/pl/auctions/list/pub/all/${main}?${params}`;
}

/** "05-555 Tarczyn, Żytnia 2" -> "Tarczyn" */
function cityFromAddress(address) {
  const city = clean(address).split(',')[0].replace(/^\d{2}-\d{3}\s*/, '');
  return city === city.toUpperCase() ? city.charAt(0) + city.slice(1).toLowerCase() : city;
}

/**
 * The card only shows a relative countdown and the end day, e.g. "6 godzin (2026-10-22)".
 * Within the last day the countdown gives a closer estimate than the bare date.
 */
function parseEnd(text) {
  const t = clean(text);
  const day = t.match(/\((\d{4})-(\d{2})-(\d{2})\)/);
  const rel = t.match(/(\d+)\s*(godz|min)/i);
  if (rel && !/dni|dzień|tydz/i.test(t)) {
    const ms = Number(rel[1]) * (/^godz/i.test(rel[2]) ? 3600e3 : 60e3);
    return new Date(Date.now() + ms);
  }
  return day ? `${day[3]}.${day[2]}.${day[1]}` : undefined;
}

function parseCard($, el, listing) {
  const card = $(el);
  const link = card.find('h2 a').first();
  const url = link.attr('href');
  const title = clean(link.text());
  if (!url || !title) return null;

  const lines = {};
  card.find('.listing-box-line').each((_, line) => {
    const key = clean($(line).find('.line-title').text()).replace(/:$/, '').toLowerCase();
    if (key) lines[key] = clean($(line).find('.line-value').text());
  });

  // Top badges: year, fuel and mileage in no fixed order.
  let year, fuel, mileage;
  card.find('.filter-labels .filter-label').each((_, b) => {
    const v = clean($(b).text());
    if (/^\d{4}$/.test(v)) year ??= v;
    else if (/\d\s*km$/i.test(v)) mileage ??= v;
    else if (v && !/\d/.test(v)) fuel ??= v;
  });
  if (!mileage && /km$/i.test(lines['przebieg'] || '')) mileage = lines['przebieg'];

  const priceEl = card.find('.listing-price').first().clone();
  priceEl.find('.listing-price-currency').remove();
  const image = (card.find('.image').attr('style') || '').match(/url\(['"]?([^'")]+)['"]?\)/)?.[1];
  const location = lines['lokalizacja'];
  const typ = lines['typ'];
  const bodySuffix =
    typ && title.toLowerCase().endsWith(' ' + typ.toLowerCase())
      ? title.slice(-typ.length)
      : listing.main === 'vehicles'
        ? title.match(BODY_SUFFIX)?.[1]
        : undefined;
  // Without this the normalizer would take e.g. "TONALE SUV" as the model.
  const det = bodySuffix ? detectBrand(title.slice(0, -bodySuffix.length)) : null;
  const model = det?.brand ? det.rest.split(/\s+/).slice(0, 2).join(' ') || undefined : undefined;

  return {
    id: card.attr('data-auction-id') || url.split('/').pop(),
    url,
    title,
    model,
    category: listing.category,
    bodyType: capitalize(typ || bodySuffix),
    year: year || lines['rok produkcji'],
    mileage,
    fuel,
    gearbox: /\b(aut|automat|dsg|s-tronic|steptronic|tiptronic|cvt)\b/i.test(title) ? 'Automatyczna' : undefined,
    powerKm: lines['moc silnika'],
    price: clean(priceEl.text()),
    priceGross: false,
    priceLabel: clean(card.find('.listing-price-label').first().text()) || 'Aktualna cena',
    saleType: 'Licytacja',
    location: location ? cityFromAddress(location) : undefined,
    endDate: parseEnd(card.find('.listing-box-time').first().text()),
    image,
  };
}

export default {
  id: 'poleasingowe',
  name: 'Poleasingowe.pl',
  url: 'https://poleasingowe.pl/',
  async scrape({ http, log, maxPages }) {
    const out = [];
    const seen = new Set();

    for (const listing of LISTINGS) {
      let count = 0;
      for (let page = 1; page <= maxPages; page++) {
        const html = await http.text(listingUrl(listing, page));
        const $ = cheerio.load(html);
        if (!$('#topsearchform').length) throw new Error(`Nieoczekiwana strona listy: ${listingUrl(listing, page)}`);

        const cards = $('.auction-element[data-auction-id]');
        cards.each((_, el) => {
          try {
            const rec = parseCard($, el, listing);
            if (rec && !seen.has(rec.id)) {
              seen.add(rec.id);
              out.push(rec);
              count++;
            }
          } catch (e) {
            log(`pominięto kartę: ${e.message}`);
          }
        });
        if (!cards.length || !$('.listing-navigation-next a').length) break;
      }
      log(`${listing.main}${listing.sub ? '/' + listing.sub : ''}: ${count}`);
    }

    log(`${out.length} rekordów`);
    return out;
  },
};
