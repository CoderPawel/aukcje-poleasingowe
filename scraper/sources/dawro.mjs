/**
 * Dom Aukcyjny Dawro (dawro.pl) – online auctions of post-leasing vehicles from Stellantis, Santander,
 * VeloBank, VeloLeasing, MultiDealer and others. Server-rendered HTML:
 *   /aukcje/sortuj,data-zakonczenia,kierunek,rosnaco,wyswietlanie,boxy,ilosc,wszystkie  – every running auction
 *   /aukcja/<id>,<slug>                                                                  – detail page
 * The listing has title, end time, starting price, year and mileage; detail pages add VIN, power,
 * engine size, first registration and the parking lot where the car can be inspected.
 * Seller pages (/aukcje/sprzedawca,<x>) are not used: without a running auction they show "recommended"
 * auctions of other sellers.
 */
import * as cheerio from 'cheerio';

const BASE = 'https://www.dawro.pl';
const LIST_URL = `${BASE}/aukcje/sortuj,data-zakonczenia,kierunek,rosnaco,wyswietlanie,boxy,ilosc,wszystkie`;
const MAX_DETAILS = 200;

const text = (el) => el.text().replace(/\s+/g, ' ').trim();

/** "102294 km" -> 102294 (passed as a number: the generic parser treats the "k" of "km" as "thousands"). */
function integer(s) {
  const n = parseInt(String(s ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Collects "Label:" / value pairs rendered as sibling `.k` + `.w|.v` elements. */
function pairs($, root, valueSel) {
  const out = {};
  root.find('.k').each((_, k) => {
    const v = $(k).nextAll(valueSel).first();
    if (v.length) out[text($(k)).replace(/:$/, '').toLowerCase()] = text(v);
  });
  return out;
}

function parseBox($, el) {
  const a = $(el).find('a[href^="/aukcja/"]').first();
  const href = a.attr('href');
  const h2 = a.find('h2.nazwa');
  // Heading is "<title>, <registration>"; the title attribute holds the clean title.
  const title = h2.attr('title') || text(h2).replace(/,\s*[A-Z0-9]{4,9}$/, '');
  if (!href || !title) return null;

  const p = pairs($, a.find('.parametry'), '.w');
  const rec = {
    id: href.match(/\/aukcja\/(\d+)/)?.[1],
    url: href,
    title,
    year: p['rok produkcji'],
    mileage: integer(p['przebieg']),
    price: p['cena wywoławcza'],
    priceGross: true,
    priceLabel: 'Cena wywoławcza',
    saleType: 'Licytacja',
    endDate: text(a.find('.koniec b')) || undefined,
    image: a.find('.zdjecie img').attr('data-original') || undefined,
  };
  return rec;
}

async function addDetails(http, rec) {
  const $ = cheerio.load(await http.text(new URL(rec.url, BASE).toString()));
  const d = {};
  $('.fl.k').each((_, k) => {
    d[text($(k)).replace(/:$/, '').toLowerCase()] = text($(k).next('.fl.v'));
  });
  if (d['pojemność']) rec.engineCcm = integer(d['pojemność']);
  if (d['moc']) rec.powerKm = integer(d['moc']);
  if (d['vin'] && /^[A-HJ-NPR-Z0-9]{17}$/i.test(d['vin'])) rec.vin = d['vin'];
  if (d['data pierwszej rejestracji']) rec.firstRegistration = d['data pierwszej rejestracji'];

  // Last address line is "04-768 Warszawa".
  const address = $('.parking-informacje .adres').html() || '';
  const lines = address.split(/<br\s*\/?>/i).map((l) => cheerio.load(l).text().trim()).filter(Boolean);
  const city = lines.at(-1)?.replace(/^\d{2}-\d{3}\s*/, '');
  if (city) rec.location = city;
}

export default {
  id: 'dawro',
  name: 'Dawro Aukcje',
  url: `${BASE}/`,
  // Auctions run in weekly rounds; between rounds the list can legitimately be empty.
  allowEmpty: true,
  async scrape({ http, log }) {
    const $ = cheerio.load(await http.text(LIST_URL));
    $('#submenu-v2, .submenu').remove();
    const boxes = $('.aukcja-box');
    if (!boxes.length && !$('.strony-kontener').length) throw new Error('Nie rozpoznano listy aukcji');

    const out = [];
    boxes.each((_, el) => {
      try {
        const rec = parseBox($, el);
        if (rec) out.push(rec);
      } catch (e) {
        log(`pominięto kartę: ${e.message}`);
      }
    });

    let details = 0;
    for (const rec of out.slice(0, MAX_DETAILS)) {
      try {
        await addDetails(http, rec);
        details++;
      } catch (e) {
        log(`szczegóły ${rec.url}: ${e.message}`);
      }
    }
    log(`${out.length} aukcji, szczegóły: ${details}`);
    return out;
  },
};
