/**
 * Template for a source module. Files starting with "_" are not loaded by the runner.
 *
 * A source exports default { id, name, url, scrape, note?, delayMs?, allowEmpty? }.
 * allowEmpty: true means an empty result is legitimate (otherwise it is reported as a probable breakage
 * and the previous data is kept); such a module should throw when it doesn't recognise the page.
 * scrape({ http, log, maxPages }) must resolve to an array of raw vehicle records:
 *
 * {
 *   id?:        string   stable id within the source (auction/offer id); used for de-duplication
 *   url:        string   absolute or relative link to the offer page (required)
 *   title:      string   e.g. "Skoda Octavia 2.0 TDI Style" (required if brand is missing)
 *   brand?:     string   make, e.g. "Skoda" (normalized automatically)
 *   model?:     string   e.g. "Octavia"
 *   version?:   string   trim / engine description
 *   category?:  string   category label from the site ("Osobowe", "Dostawcze", "Ciężarowe", ...)
 *   bodyType?:  string   body type label ("Kombi", "Furgon", "SUV", ...)
 *   year?:      number|string  production year
 *   firstRegistration?: string date of first registration
 *   mileage?:   number|string  "123 456 km"
 *   fuel?:      string
 *   gearbox?:   string
 *   engineCcm?: number|string
 *   powerKm?:   number|string  (or powerKw)
 *   price?:     number|string  current price / bid / starting price in PLN
 *   priceGross?: boolean true = brutto, false = netto, undefined = unknown
 *   priceLabel?: string e.g. "Cena wywoławcza", "Aktualna oferta", "Kup teraz"
 *   saleType?:  string e.g. "Licytacja", "Kup teraz", "Przetarg", "Oferta"
 *   location?:  string
 *   endDate?:   string|Date  auction end
 *   image?:     string   thumbnail URL
 *   vin?:       string
 * }
 *
 * http helpers (scraper/lib/http.mjs): http.text(url, opts), http.json(url, opts), http.request(url, opts)
 * opts: { headers, json, form, method }. A cookie jar is kept per source (http.jar).
 * Respect maxPages when paginating.
 */
import * as cheerio from 'cheerio';

export default {
  id: 'example',
  name: 'Example',
  url: 'https://example.com/',
  async scrape({ http, log, maxPages }) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      const html = await http.text(`https://example.com/oferty?page=${page}`);
      const $ = cheerio.load(html);
      const cards = $('.offer');
      if (!cards.length) break;
      cards.each((_, el) => {
        const c = $(el);
        out.push({ url: c.find('a').attr('href'), title: c.find('h2').text(), price: c.find('.price').text() });
      });
    }
    log(`${out.length} rekordów`);
    return out;
  },
};
