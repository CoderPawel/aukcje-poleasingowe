/**
 * Arval AutoSelect (autoselect.arval.pl) – the site front-end loads offers from a public JSON API
 * on a separate host (portal id 17 = Poland):
 *   https://portalapi-prod.autoselect.cloud/api/Announcements/17/?pageSize=..&pageNumber=..&purchaseOption=sale
 * Only "sale" (ZAKUP, fixed gross price) offers are taken; "release" offers are monthly rentals.
 */
const API = 'https://portalapi-prod.autoselect.cloud/api/Announcements/17/';
const SITE = 'https://autoselect.arval.pl/';
const PAGE_SIZE = 100;

// Model names come from a Spanish/international catalogue ("Clase CLA", "Serie 3").
const MODEL_FIXES = [
  [/^Clase\b/, 'Klasa'],
  [/^Serie\b/, 'Seria'],
];

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function fixModel(model) {
  let m = clean(model);
  for (const [re, to] of MODEL_FIXES) m = m.replace(re, to);
  return m;
}

/** Trim usually repeats the model ("Ceed SW 1.0 T-GDI ..."), sometimes not ("35 TFSI S tronic 5d"). */
function buildTitle(make, model, trim) {
  const t = clean(trim);
  const m = model.toLowerCase();
  const trimHasModel = m && (t.toLowerCase().startsWith(m) || t.toLowerCase().startsWith(m.split(' ')[0] + ' '));
  return clean([make, trimHasModel ? '' : model, t].join(' '));
}

function toRecord(a) {
  const make = clean(a.make);
  const model = fixModel(a.model);
  const d = a.details || {};
  const reserved = a.reservationLabelCode === 'reserved';
  return {
    id: String(a.id),
    url: a.offerUrl || `${SITE}uzywane-samochody/oferta/${a.id}`,
    title: buildTitle(make, model, a.trim),
    brand: make,
    model,
    version: clean(a.trim) || undefined,
    // The site has no vehicle-type filter; LCV is the only commercial body type.
    category: a.bodyTypeCode === 'LCV' ? 'Dostawcze' : 'Osobowe',
    bodyType: a.bodyType || undefined,
    year: d.registrationYear || undefined,
    firstRegistration: a.firstRegistrationDate || undefined,
    mileage: typeof d.mileage === 'number' ? Math.round(d.mileage) : undefined,
    fuel: d.fuelTypeLabel || undefined,
    gearbox: d.gearbox || undefined,
    powerKm: clean(a.trim).match(/(\d{2,4})\s*(?:KM|HP|PS)\b/i)?.[1],
    price: a.salePriceGross || undefined,
    priceGross: true,
    priceLabel: reserved ? 'Cena (rezerwacja)' : 'Cena',
    saleType: 'Oferta',
    location: a.locationDisplayName || a.location || undefined,
    image: a.mainImage || undefined,
  };
}

export default {
  id: 'arval',
  name: 'Arval AutoSelect',
  url: SITE,
  async scrape({ http, log, maxPages }) {
    const out = [];
    let pages = 1;
    for (let page = 1; page <= Math.min(pages, maxPages); page++) {
      const qs = new URLSearchParams({ pageSize: PAGE_SIZE, pageNumber: page, purchaseOption: 'sale', priceType: 'gross' });
      const res = await http.json(`${API}?${qs}`, { headers: { Origin: SITE.slice(0, -1), Referer: SITE } });
      const block = res?.announcements;
      if (!block || !Array.isArray(block.announcements)) throw new Error('Nieoczekiwana odpowiedź API (brak announcements)');
      if (page === 1) {
        pages = block.allPageQuantity || 1;
        log(`${block.allAnnouncementsCount} ofert sprzedaży (${pages} str.)`);
      }
      if (!block.announcements.length) break;
      for (const a of block.announcements) {
        try {
          if (a.purchaseOption && a.purchaseOption !== 'sale') continue;
          out.push(toRecord(a));
        } catch (e) {
          log(`pominięto ofertę ${a?.id}: ${e.message}`);
        }
      }
    }
    log(`${out.length} rekordów`);
    return out;
  },
};
