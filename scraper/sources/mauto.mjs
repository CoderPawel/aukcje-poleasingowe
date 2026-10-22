/**
 * mAuto (mauto.pl) – mLeasing's fixed-price shop; the React SPA talks to a separate Azure API:
 *   POST /api/Offers/AfterLease  { BodyTypes?, Locations? }  -> { Tails: [...], Count }   (no paging, all offers at once)
 *   GET  /api/OffersFilterData                               -> filter dictionaries (body types, locations)
 * Listing tiles lack body type and location, so they are filled in by re-querying the same endpoint
 * with a single BodyTypes / Locations filter (a few dozen small requests instead of one detail page per car).
 */
const SITE = 'https://mauto.pl';
const API = 'https://as-mleasing-mauto-api-prod.azurewebsites.net';
const IMAGE_SIZE = 640;

const FUELS = { PB: 'Benzyna', ON: 'Diesel', EL: 'Elektryczny', H: 'Hybryda', HP: 'Hybryda plug-in', LPG: 'Benzyna + LPG' };
const BODY_LABELS = { HATCHBACK: 'Hatchback', SEDAN: 'Sedan', KOMBI: 'Kombi', SUV: 'SUV', VAN: 'Van', CABRIO: 'Kabriolet', COUPE: 'Coupe' };

const offers = (http, filters = {}) =>
  http.json(`${API}/api/Offers/AfterLease`, { json: filters, headers: { Origin: SITE, Referer: `${SITE}/` } });

/** Same URL scheme as the SPA: /samochody-poleasingowe/<make-model>-id-<AuctionId>. */
function offerUrl(t) {
  const slug = String(t.MakeModel ?? '').toLowerCase().trim().replace(/\s/g, '-');
  return `${SITE}/samochody-poleasingowe/${slug ? `${slug}-` : ''}id-${t.AuctionId}`;
}

/** MainPhotoUrl contains a "[size]" placeholder; the blob has a ".webp" (or ".jpg") extension. */
function imageUrl(t) {
  if (!t.MainPhotoUrl) return undefined;
  const url = t.MainPhotoUrl.replace('[size]', String(IMAGE_SIZE));
  return /\.(jpe?g|png|webp)$/i.test(url) ? url : `${url}${t.IsWebP ? '.webp' : '.jpg'}`;
}

/** "LAND ROVER Range Rover" -> { brand: "LAND ROVER", model: "Range Rover" } using the API's make list. */
function splitMakeModel(makeModel, makes) {
  const s = String(makeModel ?? '').trim();
  const make = makes.find((m) => s.toUpperCase().startsWith(`${m} `) || s.toUpperCase() === m);
  if (make) return { brand: s.slice(0, make.length), model: s.slice(make.length).trim() || undefined };
  // Unknown make: leave brand detection to the normalizer (title starts with the make).
  return {};
}

function toRecord(t, { bodyTypes, locations, makes }) {
  if (!t?.AuctionId) return null;
  const { brand, model } = splitMakeModel(t.MakeModel, makes);
  const price = t.FinalPriceBrutto || t.TotalPriceBrutto;
  const discounted = t.TotalPriceBrutto && price < t.TotalPriceBrutto;
  const bodyType = bodyTypes.get(t.AuctionId);
  return {
    id: String(t.AuctionId),
    url: offerUrl(t),
    title: [t.MakeModel, t.Type].filter(Boolean).join(' '),
    brand,
    model,
    version: t.Type || undefined,
    category: bodyType && bodyType !== 'Van' ? 'Osobowe' : undefined,
    bodyType,
    year: t.Year,
    mileage: t.Mileage,
    fuel: FUELS[t.FuelType] ?? (t.FuelType || undefined),
    gearbox: t.GearBoxType || undefined,
    engineCcm: t.EngineCapacity || undefined,
    powerKm: t.PowerHP || undefined,
    price,
    priceGross: true,
    priceLabel: [discounted ? 'Cena promocyjna' : 'Cena', t.Reservation ? '(rezerwacja)' : ''].filter(Boolean).join(' '),
    saleType: 'Oferta',
    location: locations.get(t.AuctionId),
    image: imageUrl(t),
  };
}

/** Runs one AfterLease query per filter value and maps AuctionId -> label. */
async function mapByFilter(http, log, key, values) {
  const map = new Map();
  for (const { value, label } of values) {
    try {
      const data = await offers(http, { [key]: [value] });
      for (const t of data?.Tails ?? []) if (!map.has(t.AuctionId)) map.set(t.AuctionId, label);
    } catch (e) {
      log(`filtr ${key}=${value} nieudany: ${e.message}`);
    }
  }
  return map;
}

export default {
  id: 'mauto',
  name: 'mAuto',
  url: `${SITE}/`,
  note: 'Sprzedaż po stałej cenie (brutto) – samochody poleasingowe mLeasing.',
  async scrape({ http, log }) {
    const data = await offers(http);
    const tails = data?.Tails;
    if (!Array.isArray(tails)) throw new Error('Nieoczekiwana odpowiedź API /api/Offers/AfterLease');
    if (data.Count > tails.length) log(`uwaga: API zwróciło ${tails.length} z ${data.Count} ofert`);

    let bodyTypes = new Map();
    let locations = new Map();
    let makes = [];
    try {
      const filters = await http.json(`${API}/api/OffersFilterData`, { headers: { Origin: SITE } });
      makes = (filters.MakesAndModels ?? [])
        .map((m) => String(m.Make?.Name ?? '').toUpperCase())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
      const bodies = (filters.BodyTypes ?? []).map((b) => ({ value: b.Value, label: BODY_LABELS[b.Name] ?? b.Name }));
      const cities = [...new Set((filters.Locations ?? []).map((l) => l.Value).filter(Boolean))].map((c) => ({ value: c, label: c }));
      bodyTypes = await mapByFilter(http, log, 'BodyTypes', bodies);
      locations = await mapByFilter(http, log, 'Locations', cities);
    } catch (e) {
      log(`brak słowników filtrów (nadwozie/lokalizacja): ${e.message}`);
    }

    const out = [];
    for (const t of tails) {
      try {
        const rec = toRecord(t, { bodyTypes, locations, makes });
        if (rec) out.push(rec);
      } catch (e) {
        log(`pominięto ofertę ${t?.AuctionId}: ${e.message}`);
      }
    }
    log(`${out.length} rekordów`);
    return out;
  },
};
