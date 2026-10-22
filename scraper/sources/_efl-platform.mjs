/**
 * Shared scraper for the EFL auction platform (aukcje.efl.com.pl, ASP.NET MVC, server-rendered).
 * Used by efl.mjs (EFL's own "Pojazdy" tree) and carefleet.mjs (the "Carefleet" tree on the same site).
 *
 * Listing: /AuctionList?category=<id>&perPage=64&page=<0-based>. Category ids are resolved from the
 * friendly URL (/AuctionList/Pojazdy/Osobowe -> hidden input #Category) so slug changes are the only
 * thing that can break. Cards contain title, specs table, price and a *relative* "time left" text;
 * the exact end date, location, VIN and gearbox are only on the detail page, so details are fetched
 * for up to `detailLimit` auctions (soonest-ending first). Prices are net ("Aktualna cena (bez VAT)").
 */
import * as cheerio from 'cheerio';

export const EFL_BASE = 'https://aukcje.efl.com.pl';
const PER_PAGE = 64;

const text = (el) => el.text().replace(/\s+/g, ' ').trim();

/** "45747km" -> 45747 (passed as a number: the generic parser treats the "k" of "km" as "thousands"). */
function integer(s) {
  const n = parseInt(String(s ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** "19 godzin" / "4 dni" / "35 minut" -> approximate end timestamp (ms). */
function relativeEnd(s) {
  const m = String(s ?? '').match(/(\d+)\s*(min|godz|dni|dzie)/i);
  if (!m) return undefined;
  const unit = { min: 60e3, godz: 3600e3, dni: 86400e3, dzie: 86400e3 }[m[2].toLowerCase()];
  return Date.now() + +m[1] * unit;
}

/** Reads label/value pairs from a "simple-table" (label cell followed by value cell). */
function tableSpecs($, table) {
  const out = {};
  table.find('td').each((_, td) => {
    const label = text($(td)).replace(/:$/, '');
    if (!/:$/.test(text($(td))) || label.length > 60) return;
    const value = text($(td).next('td'));
    if (value && value !== '-') out[label.toLowerCase()] = value;
  });
  return out;
}

function applySpecs(rec, s) {
  if (s['rok produkcji']) rec.year = s['rok produkcji'];
  rec.fuel ??= s['rodzaj paliwa'];
  rec.bodyType ??= s['typ nadwozia'];
  if (s['przebieg odczytany']) rec.mileage ??= integer(s['przebieg odczytany']);
  if (s['pojemność silnika']) rec.engineCcm ??= integer(s['pojemność silnika']);
  if (s['moc silnika']) rec.powerKm ??= integer(s['moc silnika']);
  rec.gearbox ??= s['skrzynia biegów'];
  rec.vin ??= s['vin'];
  rec.firstRegistration ??= s['data pierwszej rejestracji w kraju'];
  // Detail page: "Silnik: 2891ccm (Moc 510KM)"
  const engine = s['silnik'];
  if (engine && /ccm|km/i.test(engine) && engine.length < 60) {
    rec.engineCcm ??= integer(engine.match(/(\d[\d\s]*)\s*ccm/i)?.[1]);
    rec.powerKm ??= integer(engine.match(/(\d+)\s*KM/i)?.[1]);
  }
}

/**
 * Titles look like "AUDI A4 AVANT 35 TDI 2023r." and sometimes carry a tail:
 * "... 2021r. WW358SU Pojazd znajduje się w firmie ARCTOS GROUP ..., 02-183 Warszawa".
 */
function splitTitle(raw) {
  const m = raw.match(/^(.*?)\s+((?:19|20)\d{2})\s*r\.?(?:\s+(.*))?$/);
  if (!m) return { title: raw };
  const location = m[3]?.match(/znajduje się (?:w firmie |w |na )?(.+)$/i)?.[1];
  return { title: m[1], year: m[2], location };
}

function parseCard($, el, category) {
  const card = $(el);
  const link = card.find('.AuctionTitle a').first();
  const url = link.attr('href');
  const { title, year, location } = splitTitle(text(link).replace(/MERCEDES\s*-+\s*BENZ/i, 'MERCEDES-BENZ'));
  if (!url || !title) return null;

  const rec = {
    id: url.match(/-id(\d+)$/)?.[1],
    url: new URL(url, EFL_BASE).toString(),
    title,
    year,
    location,
    category,
    image: card.find('.AuctionPhoto img').attr('src'),
    price: text(card.find('.ListAuctionInfo .price')),
    priceGross: false,
    priceLabel: 'Aktualna cena',
    saleType: 'Licytacja',
  };
  if (rec.image) rec.image = new URL(rec.image, `${EFL_BASE}/`).toString();
  applySpecs(rec, tableSpecs($, card.find('table.simple-table')));
  rec._endsAt = relativeEnd(text(card.find('.to-end')));
  return rec;
}

function parseDetail(html, rec) {
  const $ = cheerio.load(html);
  // "<label>Do zakończenia:</label><span>19 godz.</span> 23.10.2026 godzina 08:30:00"
  const end = text($('#time-to-end')).match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*(?:godzina|godz\.?)?\s*(\d{1,2}:\d{2}(?::\d{2})?)?/);
  if (end) rec.endDate = [end[1], end[2]].filter(Boolean).join(' ');
  $('.auction-info .auction-param').each((_, p) => {
    if (/Lokalizacja/i.test(text($(p).find('label')))) rec.location = text($(p).find('span'));
  });
  applySpecs(rec, tableSpecs($, $('.product-details table.simple-table')));
}

async function resolveCategoryId(http, slug) {
  const html = await http.text(`${EFL_BASE}/AuctionList/${slug}`);
  const id = cheerio.load(html)('#Category').attr('value');
  if (!id) throw new Error(`Nie znaleziono id kategorii dla /AuctionList/${slug}`);
  return id;
}

/**
 * @param {object} opts
 * @param {{slug: string, category?: string}[]} opts.categories  friendly-URL slugs under /AuctionList/
 * @param {number} opts.detailLimit  max detail pages to fetch
 */
export async function scrapeEfl({ http, log, maxPages, categories, detailLimit = 0 }) {
  const out = [];
  const seen = new Set();
  for (const cat of categories) {
    const id = await resolveCategoryId(http, cat.slug);
    let count = 0;
    for (let page = 0; page < maxPages; page++) {
      const html = await http.text(`${EFL_BASE}/AuctionList?category=${id}&perPage=${PER_PAGE}&page=${page}`);
      const $ = cheerio.load(html);
      const cards = $('.OfferList .OfferListInner');
      cards.each((_, el) => {
        try {
          const rec = parseCard($, el, cat.category);
          if (rec && !seen.has(rec.id)) {
            seen.add(rec.id);
            out.push(rec);
            count++;
          }
        } catch (e) {
          log(`pominięto kartę (${cat.slug}): ${e.message}`);
        }
      });
      if (cards.length < PER_PAGE) break;
    }
    log(`${cat.slug}: ${count}`);
  }

  const forDetails = [...out].sort((a, b) => (a._endsAt ?? Infinity) - (b._endsAt ?? Infinity)).slice(0, detailLimit);
  let failed = 0;
  for (const rec of forDetails) {
    try {
      parseDetail(await http.text(rec.url), rec);
    } catch (e) {
      failed++;
    }
  }
  if (forDetails.length) log(`szczegóły: ${forDetails.length - failed}/${forDetails.length}`);

  for (const rec of out) {
    if (!rec.endDate && rec._endsAt) rec.endDate = new Date(rec._endsAt);
    delete rec._endsAt;
  }
  return out;
}
