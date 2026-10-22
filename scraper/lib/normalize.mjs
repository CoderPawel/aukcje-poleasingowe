export const VEHICLE_TYPES = {
  osobowe: 'Osobowe',
  dostawcze: 'Dostawcze',
  ciezarowe: 'Ciężarowe',
  przyczepy: 'Przyczepy i naczepy',
  motocykle: 'Motocykle i quady',
  maszyny: 'Maszyny',
  inne: 'Inne',
};

const BRANDS = [
  ['Alfa Romeo', ['alfa romeo', 'alfa-romeo', 'alfa']],
  ['Aston Martin', ['aston martin']],
  ['Audi', ['audi']],
  ['BMW', ['bmw']],
  ['BYD', ['byd']],
  ['Cadillac', ['cadillac']],
  ['Chevrolet', ['chevrolet']],
  ['Chrysler', ['chrysler']],
  ['Citroën', ['citroen', 'citroën']],
  ['Cupra', ['cupra']],
  ['Dacia', ['dacia']],
  ['DAF', ['daf']],
  ['Dodge', ['dodge']],
  ['DS', ['ds automobiles', 'ds']],
  ['Ferrari', ['ferrari']],
  ['Fiat', ['fiat']],
  ['Ford', ['ford']],
  ['Honda', ['honda']],
  ['Hyundai', ['hyundai']],
  ['Infiniti', ['infiniti']],
  ['Isuzu', ['isuzu']],
  ['Iveco', ['iveco']],
  ['Jaguar', ['jaguar']],
  ['Jeep', ['jeep']],
  ['Kia', ['kia']],
  ['Lamborghini', ['lamborghini']],
  ['Lancia', ['lancia']],
  ['Land Rover', ['land rover', 'land-rover', 'range rover']],
  ['Lexus', ['lexus']],
  ['Lynk & Co', ['lynk & co', 'lynk&co', 'lynk']],
  ['MAN', ['man']],
  ['Maserati', ['maserati']],
  ['Maxus', ['maxus']],
  ['Mazda', ['mazda']],
  ['Mercedes-Benz', ['mercedes-benz', 'mercedes benz', 'mercedes-amg', 'mercedes', 'mb']],
  ['MG', ['mg']],
  ['MINI', ['mini']],
  ['Mitsubishi', ['mitsubishi']],
  ['Nissan', ['nissan']],
  ['Opel', ['opel']],
  ['Peugeot', ['peugeot']],
  ['Polestar', ['polestar']],
  ['Porsche', ['porsche']],
  ['Renault', ['renault']],
  ['Renault Trucks', ['renault trucks']],
  ['Saab', ['saab']],
  ['Scania', ['scania']],
  ['Seat', ['seat']],
  ['Škoda', ['skoda', 'škoda']],
  ['Smart', ['smart']],
  ['SsangYong', ['ssangyong', 'ssang yong', 'kgm']],
  ['Subaru', ['subaru']],
  ['Suzuki', ['suzuki']],
  ['Tesla', ['tesla']],
  ['Toyota', ['toyota']],
  ['Volkswagen', ['volkswagen', 'vw']],
  ['Volvo', ['volvo']],
  ['Yamaha', ['yamaha']],
  ['Kawasaki', ['kawasaki']],
  ['Ducati', ['ducati']],
  ['Harley-Davidson', ['harley-davidson', 'harley davidson', 'harley']],
  ['KTM', ['ktm']],
  ['Piaggio', ['piaggio']],
  ['Vespa', ['vespa']],
  ['Krone', ['krone']],
  ['Schmitz Cargobull', ['schmitz cargobull', 'schmitz']],
  ['Kögel', ['kogel', 'kögel']],
  ['Wielton', ['wielton']],
  ['Knapen', ['knapen']],
  ['Fliegl', ['fliegl']],
  ['Kässbohrer', ['kassbohrer', 'kässbohrer']],
  ['Schwarzmüller', ['schwarzmuller', 'schwarzmüller']],
  ['Lamberet', ['lamberet']],
  ['Chereau', ['chereau']],
  ['Neptun', ['neptun']],
  ['Temared', ['temared']],
  ['JCB', ['jcb']],
  ['Caterpillar', ['caterpillar', 'cat']],
  ['Bobcat', ['bobcat']],
  ['Komatsu', ['komatsu']],
  ['Volvo CE', ['volvo ce']],
  ['Manitou', ['manitou']],
  ['Linde', ['linde']],
  ['Still', ['still']],
  ['Jungheinrich', ['jungheinrich']],
  ['John Deere', ['john deere']],
  ['Claas', ['claas']],
  ['New Holland', ['new holland']],
  ['Case', ['case ih', 'case']],
  ['Kubota', ['kubota']],
  ['Zetor', ['zetor']],
  ['Deutz-Fahr', ['deutz-fahr', 'deutz fahr', 'deutz']],
  ['Fendt', ['fendt']],
  ['Massey Ferguson', ['massey ferguson']],
  ['Ursus', ['ursus']],
  ['Hyundai CE', ['hyundai ce']],
  ['Doosan', ['doosan']],
  ['Liebherr', ['liebherr']],
  ['Takeuchi', ['takeuchi']],
  ['Yanmar', ['yanmar']],
  ['Lexus', ['lexus']],
  ['Leapmotor', ['leapmotor']],
  ['Omoda', ['omoda']],
  ['Jaecoo', ['jaecoo']],
  ['Baic', ['baic']],
  ['Aiways', ['aiways']],
  ['Microlino', ['microlino']],
  ['Iveco Bus', ['iveco bus']],
  ['Solaris', ['solaris']],
  ['Autosan', ['autosan']],
  ['Niewiadów', ['niewiadow', 'niewiadów']],
  ['Brenderup', ['brenderup']],
  ['Humbaur', ['humbaur']],
  ['Böckmann', ['bockmann', 'böckmann']],
];

const BRAND_ALIASES = BRANDS.flatMap(([name, aliases]) => aliases.map((a) => [a, name])).sort(
  (a, b) => b[0].length - a[0].length,
);

const TRUCK_BRANDS = new Set(['DAF', 'Scania', 'Renault Trucks']);
const TRAILER_BRANDS = new Set([
  'Krone', 'Schmitz Cargobull', 'Kögel', 'Wielton', 'Knapen', 'Fliegl', 'Kässbohrer', 'Schwarzmüller',
  'Lamberet', 'Chereau', 'Neptun', 'Temared', 'Niewiadów', 'Brenderup', 'Humbaur', 'Böckmann',
]);
const MOTO_BRANDS = new Set(['Yamaha', 'Kawasaki', 'Ducati', 'Harley-Davidson', 'KTM', 'Piaggio', 'Vespa']);
const MACHINE_BRANDS = new Set([
  'JCB', 'Caterpillar', 'Bobcat', 'Komatsu', 'Volvo CE', 'Manitou', 'Linde', 'Still', 'Jungheinrich',
  'John Deere', 'Claas', 'New Holland', 'Case', 'Kubota', 'Zetor', 'Deutz-Fahr', 'Fendt', 'Massey Ferguson',
  'Ursus', 'Hyundai CE', 'Doosan', 'Liebherr', 'Takeuchi', 'Yanmar',
]);

const VAN_MODELS = [
  /\btransit\b/, /\btourneo custom\b/, /\bsprinter\b/, /\besprinter\b/, /\bcrafter\b/, /\becrafter\b/, /\bducato\b/,
  /\be-?ducato\b/, /\bboxer\b/, /\be-?boxer\b/, /\bjumper\b/, /\be-?jumper\b/, /\bmaster\b/, /\bmovano\b/,
  /\bvivaro\b/, /\btrafic\b/, /\bexpert\b/, /\be-?expert\b/, /\bjumpy\b/, /\be-?jumpy\b/, /\bproace\b(?!\s*city\s*verso)(?!\s*verso)/,
  /\bdaily\b/, /\btransporter\b/, /\bt6\.1\b/, /\bt6\b(?!.*(multivan|caravelle|california))/, /\bcitan\b/,
  /\bvito\b(?!.*tourer)/, /\bevito\b(?!.*tourer)/, /\bpartner\b/, /\bkangoo\b(?!.*(combi|zen|life|intens))/,
  /\bdoblo\b(?!.*(combi|lounge|easy))/, /\bcombo\b(?!.*life)/, /\bfiorino\b/, /\bnemo\b/, /\bbipper\b/,
  /\bdokker\b(?!.*stepway)/, /\bexpress\b/, /\btalento\b/, /\bscudo\b/, /\bnv200\b/, /\bnv250\b/, /\bnv300\b/,
  /\bnv400\b/, /\bprimastar\b/, /\binterstar\b/, /\btownstar\b(?!.*combi)/, /\bcabstar\b/, /\bnt400\b/,
  /\btge\b/, /\bhilux\b/, /\branger\b(?!\s*rover)/, /\bl200\b/, /\bnavara\b/, /\bamarok\b/, /\bd-?max\b/,
  /\bdeliver\s?\d/, /\bedeliver/, /\be-?nv200\b/, /\bberlingo\b.*\b(van|furgon|cargo|worker|l1|l2)\b/,
  /\bcaddy\b.*\b(cargo|furgon|van|maxi cargo)\b/, /\btransit connect\b/, /\btransit courier\b/, /\btransit custom\b/,
  /\bproace city\b(?!\s*verso)/, /\be-?transit\b/, /\bcanter\b/, /\bmaxity\b/, /\batego\b/, /\bmovano\b/,
  /\bpro ?ace max\b/, /\bpartner\b/, /\bkangoo\s*van\b/, /\bberlingo\s*van\b/, /\bdoblo\s*cargo\b/,
  /\bpanel\s*van\b/, /\bfurgon\b/, /\bfurgonetka\b/, /\bdostawcz/, /\bbrygad[oó]wk/, /\bdoka\b/,
  /\bkontener\b/, /\bskrzyni/, /\bplandek/, /\bchłodni/, /\bchlodni/, /\bizoterm/, /\bkiper\b/,
  /\bwywrotk.*3[,.]5/, /\bl[1-4]h[1-3]\b/, /\bpodwozie\b/, /\bpodwozie\s*kabina\b/, /\bcargo\b/, /\bvan\b/,
];

const TRUCK_MODELS = [
  /\bactros\b/, /\barocs\b/, /\bantos\b/, /\baxor\b/, /\beconic\b/,
  /\btg[lmsx]\b/, /\bvolvo\s+(fh|fm|fmx|fl|fe)\d*\b/, /\bstralis\b/, /\beurocargo\b/, /\bs-?way\b/, /\btrakker\b/,
  /\bx-?way\b/, /\bdaf\s+(xf|cf|lf|xg\+?)\b/, /\brenault\s+(t|c|k|d)\s+(wide|range|\d)/, /\brenault\s+premium\b/,
];
const TRUCK_KEYWORDS = [
  /ciagnik\s+siod/, /\bciezar/, /\bdmc\s*(1[0-9]|[4-9])[,. ]?\d*\s*t/, /\b(12|18|26|32|40)\s?t\b/,
  /\bhakowiec\b/, /\bsmieciark/, /\bbetoniark/, /\bhds\b/, /\bwywrotka\b/, /\bautobus\b/,
  /\btruck\b/, /\bdystrybucyjn/,
];
const TRUCK_PATTERNS = [...TRUCK_MODELS, ...TRUCK_KEYWORDS];

const TRAILER_PATTERNS = [/\bnaczep/, /\bprzyczep/, /\btrailer\b/, /\bsemi-?trailer\b/, /\bfirana\b/, /\bmega\b.*naczep/];
const MOTO_PATTERNS = [/\bmotocykl/, /\bskuter/, /\bquad\b/, /\bmotorower/, /\bmotor\b/, /\batv\b/];
const MACHINE_PATTERNS = [
  /\bkopark/, /\bładowark/, /\bladowark/, /\bwózek\s+widłow/, /\bwozek\s+widlow/, /\bwidlak/, /\bwidłak/,
  /\bmaszyn/, /\bciągnik\s+roln/, /\bciagnik\s+roln/, /\bkombajn/, /\bspycharka/, /\bwalec\b/, /\bmini-?kopark/,
  /\bpodnośnik/, /\bpodnosnik/, /\bteleskopow/, /\bkosiark/, /\bopryskiwacz/, /\bagregat\b/, /\bsprężark/,
];

const strip = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');

/** Maps a category label provided by a source (e.g. "Samochody dostawcze") to an internal type. */
export function typeFromCategory(category) {
  if (!category) return null;
  const c = strip(category);
  if (/naczep|przyczep|trailer/.test(c)) return 'przyczepy';
  if (/motocykl|skuter|quad|moto\b|motor/.test(c)) return 'motocykle';
  if (/maszyn|rolnicz|budowlan|wozki|wozek|widlow|sprzet|machine|equipment|ciagnik roln/.test(c)) return 'maszyny';
  if (/do\s*3[,.]5|<\s*3[,.]5|lcv|dostawcz|bus\b|van\b|lekkie uzytkowe|uzytkow|light commercial|furgon|n1\b/.test(c))
    return 'dostawcze';
  if (/ciezar|truck|ciagnik|siodl|hgv|powyzej\s*3[,.]5|>\s*3[,.]5|autobus|n[23]\b/.test(c)) return 'ciezarowe';
  if (/osobow|passenger|\bcar\b|cars|suv|terenow|kombi|sedan|hatchback|kabriolet|coupe|minivan|m1\b/.test(c))
    return 'osobowe';
  return null;
}

/**
 * Determines vehicle type using (in order): source category, brand, then title keyword heuristics.
 */
export function classifyType({ category, title = '', brand, model = '', bodyType = '' }) {
  const fromCat = typeFromCategory(category);
  const text = strip(`${brand ?? ''} ${model ?? ''} ${title ?? ''} ${bodyType ?? ''}`);
  // Sources often tag all N1 vans as "ciężarowe" (Polish registration class), so refine with model hints.
  if (fromCat === 'ciezarowe' && VAN_MODELS.some((r) => r.test(text)) && !TRUCK_MODELS.some((r) => r.test(text)))
    return 'dostawcze';
  if (fromCat) return fromCat;

  const bodyCat = typeFromCategory(bodyType);
  if (bodyCat && bodyCat !== 'osobowe') return bodyCat;

  if (brand && TRAILER_BRANDS.has(brand)) return 'przyczepy';
  if (brand && MOTO_BRANDS.has(brand)) return 'motocykle';
  if (brand && MACHINE_BRANDS.has(brand)) return 'maszyny';
  if (TRAILER_PATTERNS.some((r) => r.test(text))) return 'przyczepy';
  if (MACHINE_PATTERNS.some((r) => r.test(text))) return 'maszyny';
  if (MOTO_PATTERNS.some((r) => r.test(text))) return 'motocykle';
  if (brand && TRUCK_BRANDS.has(brand)) return 'ciezarowe';
  if (TRUCK_PATTERNS.some((r) => r.test(text))) return 'ciezarowe';
  if (VAN_MODELS.some((r) => r.test(text))) return 'dostawcze';
  return 'osobowe';
}

/** Detects brand from a free-text title; returns { brand, rest } where rest is the remainder (model + version). */
export function detectBrand(title) {
  const raw = cleanText(title);
  const t = strip(raw);
  for (const [alias, name] of BRAND_ALIASES) {
    const a = strip(alias);
    if (t === a || t.startsWith(a + ' ') || t.startsWith(a + '-') || t.startsWith(a + ',')) {
      return { brand: name, rest: raw.slice(alias.length).replace(/^[\s,\-]+/, '') };
    }
  }
  for (const [alias, name] of BRAND_ALIASES) {
    if (alias.length < 3) continue;
    const re = new RegExp(`(^|[\\s(/,])${escapeRe(strip(alias))}($|[\\s),/-])`);
    const m = re.exec(t);
    if (m) {
      const idx = m.index + m[1].length;
      return { brand: name, rest: raw.slice(idx + alias.length).replace(/^[\s,\-]+/, '') };
    }
  }
  return { brand: null, rest: raw };
}

export function canonicalBrand(brand) {
  if (!brand) return null;
  const t = strip(cleanText(brand));
  for (const [alias, name] of BRAND_ALIASES) if (strip(alias) === t) return name;
  return titleCase(cleanText(brand));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function titleCase(s) {
  if (!s) return s;
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

export function cleanText(s) {
  if (s == null) return '';
  return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Parses "123 456,78 zł" / "123.456 PLN" / 123456 into a number. */
export function parseNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/\u00a0/g, ' ').replace(/[^\d,.\s-]/g, '').trim();
  if (!s) return null;
  s = s.replace(/\s+/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{1,2}$/.test(s) && (s.match(/\./g) || []).length === 1) s = s.replace(/,/g, '');
  else s = s.replace(/[.,]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function parseYear(v) {
  if (v == null) return null;
  const m = String(v).match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  if (!m) return null;
  const y = +m[1];
  return y <= new Date().getFullYear() + 1 ? y : null;
}

export function parseMileage(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v >= 0 && v < 5e6 ? Math.round(v) : null;
  const s = String(v);
  const m = s.match(/(\d[\d\s.\u00a0]*)\s*(tys\.?|k(?!m))?\s*(km|mth|mtg|h)?/i);
  if (!m) return null;
  let n = parseNumber(m[1]);
  if (n == null) return null;
  if (m[2]) n *= 1000;
  return n >= 0 && n < 5e6 ? Math.round(n) : null;
}

export function normalizeFuel(v) {
  if (!v) return null;
  const s = strip(v);
  if (/plug|phev|plugin/.test(s)) return 'Hybryda plug-in';
  if (/hybr|hev|mhev|mild/.test(s)) return 'Hybryda';
  if (/elektr|electric|\bev\b|bev/.test(s)) return 'Elektryczny';
  if (/lpg|gaz/.test(s)) return 'Benzyna + LPG';
  if (/cng/.test(s)) return 'CNG';
  if (/diesel|olej|\bon\b|tdi|crdi|dci|hdi|cdi|jtd|tdci|d4d|bluehdi/.test(s)) return 'Diesel';
  if (/benz|petrol|gasoline|\bpb\b|tsi|tfsi/.test(s)) return 'Benzyna';
  if (/wodor|hydrogen/.test(s)) return 'Wodór';
  return cleanText(v);
}

export function guessFuelFromTitle(title) {
  const s = strip(title);
  if (/\b(phev|plug-?in|e-?hybrid)\b/.test(s)) return 'Hybryda plug-in';
  if (/\b(hybrid|hybryda|hev)\b/.test(s)) return 'Hybryda';
  if (/\b(ev|electric|elektryczny|e-tron|bev|kwh)\b/.test(s)) return 'Elektryczny';
  if (/\b(tdi|crdi|dci|hdi|bluehdi|cdi|jtd|multijet|tdci|ecoblue|d4d|\d\.\dd|\d{3}d)\b/.test(s)) return 'Diesel';
  if (/\b(tsi|tfsi|tce|puretech|ecoboost|mpi|t-gdi|vtec|\d{3}i)\b/.test(s)) return 'Benzyna';
  return null;
}

export function normalizeGearbox(v) {
  if (!v) return null;
  const s = strip(v);
  if (/autom|dsg|cvt|tiptronic|s-?tronic|steptronic|edc|eat|\bat\b|e-cvt|pdk|powershift|sekwenc/.test(s))
    return 'Automatyczna';
  if (/manual|reczn|\bmt\b|mechaniczn/.test(s)) return 'Manualna';
  return cleanText(v);
}

export function absUrl(href, base) {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Parses Polish/ISO date strings ("22.10.2026 14:00", "2026-10-22T12:00:00Z") into ISO string. */
export function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000).toISOString();
  const s = cleanText(v);
  let m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ ,T]+(?:godz\.?\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, d, mo, y, h = '12', mi = '00', se = '00'] = m;
    const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:${se}`;
    const dt = new Date(iso + polandOffset(new Date(iso + 'Z')));
    return isNaN(dt) ? null : dt.toISOString();
  }
  m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) {
    const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
    const dt = new Date(hasTz ? s : s.replace(' ', 'T') + polandOffset(new Date(s.slice(0, 10) + 'T12:00:00Z')));
    return isNaN(dt) ? null : dt.toISOString();
  }
  return null;
}

/** Returns "+01:00" or "+02:00" depending on whether the date falls in Polish DST (last Sun Mar – last Sun Oct). */
function polandOffset(d) {
  const y = d.getUTCFullYear();
  const lastSun = (month) => {
    const dt = new Date(Date.UTC(y, month + 1, 0, 1));
    dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
    return dt;
  };
  return d >= lastSun(2) && d < lastSun(9) ? '+02:00' : '+01:00';
}

/**
 * Converts a raw record from a source into the normalized vehicle schema used by the website.
 */
export function normalizeVehicle(raw, source) {
  const title = cleanText(raw.title || [raw.brand, raw.model, raw.version].filter(Boolean).join(' '));
  let brand = canonicalBrand(raw.brand);
  let model = cleanText(raw.model) || null;
  if (!brand) {
    const det = detectBrand(title);
    brand = det.brand;
    if (!model && det.rest) model = det.rest.split(/\s+/).slice(0, 2).join(' ').replace(/[,;]$/, '') || null;
  } else if (!model) {
    const det = detectBrand(title);
    if (det.rest) model = det.rest.split(/\s+/).slice(0, 2).join(' ').replace(/[,;]$/, '') || null;
  }
  if (model && brand && strip(model).startsWith(strip(brand) + ' ')) model = model.slice(brand.length + 1);
  if (model) model = model.replace(/^[\s,\-]+/, '');

  const price = parseNumber(raw.price);
  const year = parseYear(raw.year) ?? parseYear(raw.firstRegistration);
  const mileageKm = parseMileage(raw.mileage);
  const fuel = normalizeFuel(raw.fuel) || guessFuelFromTitle(title);
  const type = raw.type && VEHICLE_TYPES[raw.type] ? raw.type : classifyType({ category: raw.category, title, brand, model, bodyType: raw.bodyType });

  const url = absUrl(raw.url, source.url) || source.url;
  const id = `${source.id}:${raw.id ?? hash(url + '|' + title)}`;

  return {
    id,
    source: source.id,
    sourceName: source.name,
    url,
    title: title || [brand, model].filter(Boolean).join(' ') || 'Pojazd',
    brand: brand || 'Inna',
    model: model || null,
    version: cleanText(raw.version) || null,
    type,
    year,
    mileageKm,
    fuel,
    gearbox: normalizeGearbox(raw.gearbox),
    engineCcm: parseNumber(raw.engineCcm) || null,
    powerKm: parseNumber(raw.powerKm) || (raw.powerKw ? Math.round(parseNumber(raw.powerKw) * 1.36) : null),
    bodyType: cleanText(raw.bodyType) || null,
    price: price && price > 0 ? Math.round(price) : null,
    priceGross: raw.priceGross ?? null,
    currency: raw.currency || 'PLN',
    priceLabel: cleanText(raw.priceLabel) || null,
    saleType: cleanText(raw.saleType) || null,
    location: cleanText(raw.location) || null,
    endDate: parseDate(raw.endDate),
    image: absUrl(raw.image, source.url),
    vin: cleanText(raw.vin) || null,
  };
}

export function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
