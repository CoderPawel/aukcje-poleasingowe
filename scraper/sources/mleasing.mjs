/**
 * mLeasing Portal Aukcyjny (portalaukcyjny.mleasing.pl) – Next.js static export backed by an ASP.NET API:
 *   POST /api/offer-read/search  { pageNumber, pageSize, category, orderBy }  -> { items, totalCount }
 *   GET  /api/filter/get-branches                                             -> branch id -> label
 * POSTs are protected by ASP.NET antiforgery: any GET sets the XSRF-TOKEN cookie, which must be echoed
 * in the X-XSRF-TOKEN header. Listing items carry all main data, so detail pages are not fetched.
 */
const BASE = 'https://portalaukcyjny.mleasing.pl';
const PAGE_SIZE = 100;

// Site categories (search `category` values). Devices / Medical / Other are industrial equipment, not vehicles.
const CATEGORIES = [
  { id: 'Passenger', category: 'Osobowe' },
  { id: 'Vans', category: 'Dostawcze' },
  { id: 'Lorries', category: 'Ciężarowe' },
  { id: 'Construction', category: 'Maszyny budowlane' },
];

// Branches that are more specific than the search category (e.g. motorcycles live under "Passenger").
const SPECIFIC_BRANCHES = /motocykl|quad|naczep|przyczep|autobus|ciągnik/i;

/** Same slug rules as the site's frontend (used in offer URLs). */
function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .replaceAll('ł', 'l')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^\da-z]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Removes internal staff tags from offer names, e.g. "[kar]", "{paw}", "(grz)", trailing "prz". */
function cleanName(name) {
  return String(name ?? '')
    .replace(/[[{(](kar|paw|grz|prz)[\]})]/gi, ' ')
    .replace(/\s+-?\s*(kar|paw|grz|prz)\b(?=\s*(\(|$))/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[\s,-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const BODY_TYPES = { kombi: 'Kombi', hatchback: 'Hatchback', sedan: 'Sedan', cabrio: 'Kabriolet', kabriolet: 'Kabriolet', coupe: 'Coupe', liftback: 'Liftback' };
const BODY_RE = new RegExp(`\\s+(${Object.keys(BODY_TYPES).join('|')})\\b`, 'i');

/**
 * Model field examples: "Panamera 16-20", "E Klasa [W 213] 16-20", "Optima Kombi 16-18",
 * vans/trucks: "Master dCi 165 Energy Euro 6 2299ccm - 163KM 3,5t 19-24", motorcycles: "Cross/Enduro".
 */
function parseModel(model, version) {
  if (!model) return {};
  let m = model.replace(/\[[^\]]*\]/g, ' ').replace(/\s+\d{2}-(\d{1,2})?\s*$/, '').replace(/\s+/g, ' ').trim();
  if (/euro\s*\d|ccm|cm3|\d+\s*km\b/i.test(m)) m = m.split(/\s+/)[0];
  // Motorcycles use a segment as model – the version holds the real model name.
  if (/^[a-z]+\/[a-z]+$/i.test(m) && version) m = version.split(/\s+/).slice(0, 2).join(' ');
  const body = m.match(BODY_RE)?.[1];
  if (body) m = m.replace(BODY_RE, '').trim();
  return { model: m || undefined, bodyType: body ? BODY_TYPES[body.toLowerCase()] : undefined };
}

/** Engine data is hidden in the model field of commercial vehicles ("... 2179ccm - 165KM ...") or in the name. */
function engineData(item) {
  const s = `${item.model ?? ''} ${item.name ?? ''}`;
  return {
    engineCcm: s.match(/(\d{3,5})\s*(?:ccm|cm3)/i)?.[1],
    powerKm: s.match(/(\d{2,4})\s*KM\b/)?.[1],
  };
}

/** Frontend route: /oferta/<branch-slug>/<make-model-slug>-<id>/ */
function offerUrl(item, branch) {
  const slug = [slugify([item.make, item.model].filter(Boolean).join(' ')), item.id].filter(Boolean).join('-');
  return `${BASE}/oferta/${branch ? `${branch.slug}/` : ''}${slug}/`;
}

function toRecord(item, { category, branches }) {
  if (!item?.id) return null;
  const branch = branches.get(item.branchId);
  const brand = item.make?.split('/')[0].replace(/\(.*\)/, '').trim() || undefined;
  const version = item.type?.replace(/\(\w*\d+\w*\)[.,]?\s*$/, '').trim() || undefined;
  const loc = item.locations?.[0];
  const priceLabel = item.auctionType === 'Auction' ? 'Cena wywoławcza' : 'Sugerowana kwota oferty';

  return {
    id: String(item.id),
    url: offerUrl(item, branch),
    title: cleanName(item.name) || [brand, version].filter(Boolean).join(' '),
    brand,
    ...parseModel(item.model, version),
    version,
    category: branch && SPECIFIC_BRANCHES.test(branch.label) ? branch.label : category,
    year: item.productionYear ?? undefined,
    mileage: item.milage > 0 ? item.milage : undefined,
    fuel: item.fuelType && item.fuelType !== 'Nie dotyczy' ? item.fuelType : undefined,
    gearbox: item.gearBoxType && item.gearBoxType !== 'Brak' ? item.gearBoxType : undefined,
    ...engineData(item),
    price: item.amount,
    priceGross: typeof item.isGrossAmount === 'boolean' ? item.isGrossAmount : undefined,
    priceLabel: item.isBuyNow && item.amountBuyNow ? `${priceLabel} (Kup teraz: ${item.amountBuyNow} zł)` : priceLabel,
    saleType: item.auctionType === 'Auction' ? (item.isBuyNow ? 'Licytacja / Kup teraz' : 'Licytacja') : 'Oferta',
    location: loc ? [loc.city, loc.postalCode?.trim()].filter(Boolean).join(' ') : undefined,
    endDate: item.to,
    image: item.thumbnailUrl,
  };
}

async function loadBranches(http) {
  const list = await http.json(`${BASE}/api/filter/get-branches`);
  return new Map(list.map((b) => [b.value, { label: b.label, slug: slugify(b.label) }]));
}

async function search(http, body) {
  return http.json(`${BASE}/api/offer-read/search`, {
    json: body,
    headers: { 'X-XSRF-TOKEN': decodeURIComponent(http.jar.get('XSRF-TOKEN') ?? ''), Referer: `${BASE}/oferty` },
  });
}

export default {
  id: 'mleasing',
  name: 'mLeasing Portal Aukcyjny',
  url: `${BASE}/`,
  async scrape({ http, log, maxPages }) {
    // The branches request also sets the antiforgery cookies needed by the search POST.
    const branches = await loadBranches(http);
    if (!http.jar.get('XSRF-TOKEN')) throw new Error('Brak ciasteczka XSRF-TOKEN');

    const out = [];
    const seen = new Set();
    for (const cat of CATEGORIES) {
      let count = 0;
      for (let page = 1; page <= maxPages; page++) {
        const data = await search(http, {
          pageNumber: page,
          pageSize: PAGE_SIZE,
          category: cat.id,
          orderBy: [{ fieldName: 'id', descending: true }],
        });
        const items = data?.items ?? [];
        for (const item of items) {
          try {
            const rec = toRecord(item, { category: cat.category, branches });
            if (rec && !seen.has(rec.id)) {
              seen.add(rec.id);
              out.push(rec);
              count++;
            }
          } catch (e) {
            log(`pominięto ofertę ${item?.id}: ${e.message}`);
          }
        }
        if (items.length < PAGE_SIZE || page * PAGE_SIZE >= (data.totalCount ?? 0)) break;
      }
      log(`${cat.category}: ${count}`);
    }
    log(`${out.length} rekordów`);
    return out;
  },
};
