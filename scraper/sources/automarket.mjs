/**
 * Automarket (automarket.pl, PKO Leasing) – Nuxt app; the listing calls its own JSON endpoint:
 *   GET /api/search/short?vehicle_state=Używany&warranty_protection=1&is_company=0&page=N&page_size=S
 *     -> { items, pagination: { totalCount, currentPage, pageSize } }
 * The site also lists ~40k used cars of partner dealers; PKO Leasing's own post-leasing cars are the used
 * ones with "warranty_protection=1" (the filter used by the /samochody-poleasingowe landing page).
 * The API returns page_size-1 items per page and offsets pages accordingly, so paging by `page` is gapless.
 */
const BASE = 'https://automarket.pl';
const PAGE_SIZE = 200;
const IMAGE_PRESET = 'rs:fill:480:360';

const FUELS = { PB: 'Benzyna', ON: 'Diesel', 'PB/LPG': 'Benzyna + LPG' };
// Site body styles that are unambiguous; Van / Minibus / Pickup are left to the normalizer's model heuristics.
const PASSENGER_BODIES = new Set(['SUV', 'Hatchback', 'Kombi', 'Sedan', 'Kabriolet', 'Coupe', 'Liftback']);

function categoryOf(bodyStyle) {
  if (bodyStyle === 'Dostawczy') return 'Dostawcze';
  return PASSENGER_BODIES.has(bodyStyle) ? 'Osobowe' : undefined;
}

function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .replaceAll('ł', 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Offer route is /oferta/:brand/:model/:sku/:financing (slugs are cosmetic, the sku identifies the car). */
const offerUrl = (item) => `${BASE}/oferta/${slugify(item.brand) || 'auto'}/${slugify(item.model) || 'model'}/${item.sku}/leasing`;

/** Gallery entries are base64 path segments served by the imgproxy CDN. */
function imageUrl(item) {
  const path = item.mediaGallery?.find((m) => m.mediaType === 'image')?.url;
  return path ? `https://cdn.automarket.pl/i/_/${IMAGE_PRESET}/${path}.jpg` : undefined;
}

/**
 * Gross price for a private buyer: the cash price when the car can be bought outright, otherwise the
 * financed amount of the loan offer (= full price) or the down payment scaled by its percentage.
 */
function grossPrice(item) {
  if (item.cashVariant?.installment) return { price: item.cashVariant.installment, label: 'Cena brutto' };
  for (const v of [item.defaultVariant, item.dynamicVariant]) {
    if (v?.loanAmount) return { price: v.loanAmount, label: 'Cena brutto' };
  }
  const v = item.dynamicVariant;
  if (v?.owAmount && v?.owProc) return { price: Math.round((v.owAmount * 100) / v.owProc), label: 'Cena brutto (szacunkowa)' };
  return {};
}

/** equipmentVersion usually repeats the model: ("DS4", "DS 4 1.2 mHEV") -> "1.2 mHEV"; keeps "500e ..." for model "500". */
function stripModelPrefix(version, model) {
  const target = String(model ?? '').toLowerCase().replace(/\s+/g, '');
  if (!version || !target) return version;
  let matched = 0;
  let i = 0;
  for (; i < version.length && matched < target.length; i++) {
    const ch = version[i].toLowerCase();
    if (ch === ' ') continue;
    if (ch !== target[matched]) return version;
    matched++;
  }
  return matched === target.length && (i === version.length || version[i] === ' ') ? version.slice(i).trim() : version;
}

/** "KRAKÓW " -> "Kraków" */
function cleanCity(city) {
  const c = String(city ?? '').replace(/\s+/g, ' ').trim();
  return c && c === c.toUpperCase() ? c.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : c;
}

function toRecord(item) {
  if (!item?.id || !item.sku) return null;
  const version = item.equipmentVersion && item.equipmentVersion !== '-' ? item.equipmentVersion.trim() : undefined;
  const titleTail = stripModelPrefix(version, item.model);
  const { price, label } = grossPrice(item);
  return {
    id: String(item.id),
    url: offerUrl(item),
    title: [item.name || [item.brand, item.model].filter(Boolean).join(' '), titleTail].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    brand: item.brand?.replace(/\s*\[.*?\]/, ''),
    model: item.model,
    version,
    category: categoryOf(item.bodyStyle),
    bodyType: item.bodyStyle || undefined,
    year: item.productionYear,
    mileage: item.course,
    fuel: FUELS[item.fuelType] ?? (item.fuelType || undefined),
    gearbox: item.gearboxType || undefined,
    engineCcm: item.engineCapacity || undefined,
    powerKm: item.power || undefined,
    price,
    priceGross: price ? true : undefined,
    priceLabel: [label, item.reserved ? '(rezerwacja)' : ''].filter(Boolean).join(' ') || undefined,
    saleType: 'Oferta',
    location: [cleanCity(item.locationCity), item.locationRegion].filter(Boolean).join(', ') || undefined,
    image: imageUrl(item),
    vin: item.vin || undefined,
  };
}

export default {
  id: 'automarket',
  name: 'Automarket',
  url: `${BASE}/samochody-poleasingowe`,
  note: 'Samochody poleasingowe PKO Leasing (z gwarancją) – sprzedaż po stałej cenie.',
  async scrape({ http, log, maxPages }) {
    const out = [];
    const seen = new Set();
    let total = null;
    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({
        vehicle_state: 'Używany',
        warranty_protection: '1',
        is_company: '0',
        sort_by: 'newest',
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      const data = await http.json(`${BASE}/api/search/short?${params}`, { headers: { Referer: `${BASE}/samochody/uzywane/wszystkie` } });
      if (!Array.isArray(data?.items)) throw new Error('Nieoczekiwana odpowiedź /api/search/short');
      total ??= data.pagination?.totalCount ?? null;

      for (const item of data.items) {
        try {
          const rec = toRecord(item);
          if (rec && !seen.has(rec.id)) {
            seen.add(rec.id);
            out.push(rec);
          }
        } catch (e) {
          log(`pominięto ofertę ${item?.id}: ${e.message}`);
        }
      }
      const perPage = data.pagination?.pageSize || data.items.length;
      if (!data.items.length || (total != null && page * perPage >= total)) break;
    }
    log(`${out.length} rekordów (API: ${total ?? '?'})`);
    return out;
  },
};
