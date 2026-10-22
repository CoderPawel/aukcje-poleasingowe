const TYPES = [
  { id: 'osobowe', label: 'Osobowe', always: true },
  { id: 'dostawcze', label: 'Dostawcze', always: true },
  { id: 'ciezarowe', label: 'Ciężarowe', always: true },
  { id: 'przyczepy', label: 'Przyczepy i naczepy' },
  { id: 'motocykle', label: 'Motocykle' },
  { id: 'maszyny', label: 'Maszyny' },
  { id: 'inne', label: 'Inne' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.id, t.label]));
const PAGE_SIZE = 48;
const GROUP_PREVIEW = 12;
const GROUPS_OPEN_BY_DEFAULT = 8;
const BRAND_LIST_LIMIT = 40;
const ENDED_GRACE_MS = 60 * 60 * 1000;

const $ = (sel, root = document) => root.querySelector(sel);
const fmtInt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const fmtPrice = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
const fmtDate = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });

/** Lowercases and strips diacritics char-by-char so indexes stay aligned with the original string. */
const foldChar = (c) => (c === 'ł' || c === 'Ł' ? 'l' : c.normalize('NFD').charAt(0).toLowerCase());
const fold = (s) => Array.from(String(s ?? ''), foldChar).join('');

const state = {
  q: '',
  type: '',
  brands: new Set(),
  models: new Set(),
  sources: new Set(),
  fuels: new Set(),
  gears: new Set(),
  priceMin: null,
  priceMax: null,
  yearMin: null,
  yearMax: null,
  kmMin: null,
  kmMax: null,
  withPrice: false,
  ending: '',
  favOnly: false,
  groupBy: '',
  sortBy: 'relevance',
  view: 'grid',
  limit: PAGE_SIZE,
};

let vehicles = [];
let sources = [];
let favorites = new Set(JSON.parse(localStorage.getItem('favorites') || '[]'));
let brandSearch = '';
let showAllBrands = false;
const expandedGroups = new Map();

/* ---------- URL state ---------- */

const SET_KEYS = { brands: 'marka', models: 'model', sources: 'portal', fuels: 'paliwo', gears: 'skrzynia' };
const NUM_KEYS = { priceMin: 'cena_od', priceMax: 'cena_do', yearMin: 'rok_od', yearMax: 'rok_do', kmMin: 'km_od', kmMax: 'km_do' };

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.q = p.get('q') || '';
  state.type = p.get('typ') || '';
  for (const [k, param] of Object.entries(SET_KEYS)) state[k] = new Set(p.getAll(param));
  for (const [k, param] of Object.entries(NUM_KEYS)) state[k] = p.has(param) ? +p.get(param) || null : null;
  state.withPrice = p.get('z_cena') === '1';
  state.ending = p.get('koniec') || '';
  state.favOnly = p.get('ulubione') === '1';
  state.groupBy = p.get('grupuj') || localStorage.getItem('groupBy') || '';
  state.sortBy = p.get('sort') || 'relevance';
  state.view = localStorage.getItem('view') || 'grid';
}

function writeUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.type) p.set('typ', state.type);
  for (const [k, param] of Object.entries(SET_KEYS)) for (const v of state[k]) p.append(param, v);
  for (const [k, param] of Object.entries(NUM_KEYS)) if (state[k] != null) p.set(param, state[k]);
  if (state.withPrice) p.set('z_cena', '1');
  if (state.ending) p.set('koniec', state.ending);
  if (state.favOnly) p.set('ulubione', '1');
  if (state.groupBy) p.set('grupuj', state.groupBy);
  if (state.sortBy !== 'relevance') p.set('sort', state.sortBy);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

/* ---------- Data ---------- */

const MODEL_PREFIXES = [
  'transit custom', 'transit connect', 'transit courier', 'tourneo custom', 'tourneo connect', 'tourneo courier',
  'range rover', 'grand cherokee', 'proace city', 'grand c4', 'grand scenic', 'land cruiser', 'santa fe',
  'space star', 'model 3', 'model y', 'model s', 'model x', 'id. buzz', 'e-tron gt', 'mustang mach-e',
  'c4 picasso', 'c4 cactus', 'c-max', 'grand c-max', 's-max', 'b-max', 'x-trail', 'cx-5', 'cx-30', 'cx-3', 'cx-60',
  'mx-5', 'c-hr', 'rav4', 'combo life', 'berlingo van', 'partner tepee', 'kangoo express',
];

/** Collapses detailed model strings ("Octavia 2.0 TDI", "320d xDrive") into a family used for grouping. */
function modelFamily(v) {
  if (v.modelGroup) return v.modelGroup;
  const m = (v.model || '').trim();
  if (!m) return 'Inny model';
  const f = fold(m);
  for (const p of MODEL_PREFIXES) if (f.startsWith(p)) return m.slice(0, p.length);
  const first = m.split(/[\s,/(]+/)[0];
  if (v.brand === 'BMW') {
    const s = /^(\d)\d{2}[a-z]*$/i.exec(first) || /^seria$/i.test(first) && /^seria\s+(\d)/i.exec(m);
    if (s) return `Seria ${s[1]}`;
    if (/^[ixz]\d/i.test(first)) return first.toUpperCase();
  }
  if (v.brand === 'Mercedes-Benz') {
    const klasa = /^klasa\s+([a-z]+)/i.exec(m) || /^([a-z]{1,3})[\s-]?(klasa|class)/i.exec(m);
    if (klasa) return `Klasa ${klasa[1].toUpperCase()}`;
    const letters = /^([a-z]{1,3})(?:[\s-]?\d{2,3}[a-z]*)?$/i.exec(first) || /^([a-z]{1,3})[\s-]?\d{2,3}\b/i.exec(m);
    if (letters) {
      const l = letters[1].toUpperCase();
      return /^[ABCEGSVX]$/.test(l) ? `Klasa ${l}` : l;
    }
  }
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function prepare(list) {
  const now = Date.now();
  return list
    .map((v) => {
      const end = v.endDate ? Date.parse(v.endDate) : null;
      const fam = modelFamily(v);
      return {
        ...v,
        _end: end,
        _seen: v.firstSeen ? Date.parse(v.firstSeen) : 0,
        _model: fam,
        _modelKey: `${v.brand}|${fam}`,
        _search: fold([v.title, v.brand, v.model, v.version, v.location, v.vin, v.sourceName, TYPE_LABEL[v.type], v.fuel, v.bodyType, v.year].filter(Boolean).join(' ')),
        _titleFold: fold(v.title),
      };
    })
    .filter((v) => !v._end || v._end > now - ENDED_GRACE_MS);
}

async function loadData() {
  const [vRes, sRes] = await Promise.all([
    fetch('data/vehicles.json', { cache: 'no-cache' }),
    fetch('data/sources.json', { cache: 'no-cache' }).catch(() => null),
  ]);
  if (!vRes.ok) throw new Error(`Nie udało się pobrać danych (${vRes.status})`);
  const vData = await vRes.json();
  const sData = sRes && sRes.ok ? await sRes.json() : { sources: [] };
  vehicles = prepare(vData.vehicles || []);
  sources = sData.sources || [];
  const updated = vData.generatedAt ? new Date(vData.generatedAt) : null;
  $('#updatedAt').textContent = updated ? `· aktualizacja ${fmtDate.format(updated)}` : '';
}

/* ---------- Filtering ---------- */

function tokens() {
  return fold(state.q).split(/\s+/).filter(Boolean);
}

/** Checks all filters except the one named in `skip` (used for faceted counts). */
function matches(v, toks, skip) {
  if (skip !== 'type' && state.type && v.type !== state.type) return false;
  if (skip !== 'brand' && state.brands.size && !state.brands.has(v.brand)) return false;
  if (skip !== 'model' && state.models.size && !state.models.has(v._modelKey)) return false;
  if (skip !== 'source' && state.sources.size && !state.sources.has(v.source)) return false;
  if (skip !== 'fuel' && state.fuels.size && !state.fuels.has(v.fuel || '—')) return false;
  if (skip !== 'gear' && state.gears.size && !state.gears.has(v.gearbox || '—')) return false;
  if (state.favOnly && !favorites.has(v.id)) return false;
  if (state.withPrice && !v.price) return false;
  if (state.priceMin != null && !(v.price >= state.priceMin)) return false;
  if (state.priceMax != null && !(v.price <= state.priceMax)) return false;
  if (state.yearMin != null && !(v.year >= state.yearMin)) return false;
  if (state.yearMax != null && !(v.year <= state.yearMax)) return false;
  if (state.kmMin != null && !(v.mileageKm >= state.kmMin)) return false;
  if (state.kmMax != null && !(v.mileageKm <= state.kmMax)) return false;
  if (state.ending) {
    const limit = Date.now() + +state.ending * 3600 * 1000;
    if (!v._end || v._end > limit) return false;
  }
  for (const t of toks) if (!v._search.includes(t)) return false;
  return true;
}

function countBy(list, keyFn) {
  const m = new Map();
  for (const v of list) {
    const k = keyFn(v);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function facetCounts(toks) {
  const facets = { type: 'type', brand: 'brand', model: '_modelKey', source: 'source', fuel: 'fuel', gear: 'gearbox' };
  const out = {};
  for (const [name, field] of Object.entries(facets)) {
    out[name] = countBy(
      vehicles.filter((v) => matches(v, toks, name)),
      (v) => v[field] || '—',
    );
  }
  return out;
}

function relevance(v, toks) {
  let s = 0;
  for (const t of toks) {
    if (v._titleFold.startsWith(t)) s += 3;
    else if (v._titleFold.includes(' ' + t)) s += 2;
    else if (v._titleFold.includes(t)) s += 1;
  }
  return s;
}

const nullsLast = (a, b, dir = 1) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : (a - b) * dir);

function sortList(list, toks) {
  const by = state.sortBy;
  const cmp = {
    priceAsc: (a, b) => nullsLast(a.price, b.price),
    priceDesc: (a, b) => nullsLast(a.price, b.price, -1),
    yearDesc: (a, b) => nullsLast(a.year, b.year, -1),
    yearAsc: (a, b) => nullsLast(a.year, b.year),
    kmAsc: (a, b) => nullsLast(a.mileageKm, b.mileageKm),
    endAsc: (a, b) => nullsLast(a._end, b._end),
    newest: (a, b) => b._seen - a._seen,
    name: (a, b) => a.title.localeCompare(b.title, 'pl'),
    relevance: toks.length
      ? (a, b) => relevance(b, toks) - relevance(a, toks) || nullsLast(a._end, b._end)
      : (a, b) => b._seen - a._seen || nullsLast(a._end, b._end),
  }[by] || (() => 0);
  return list.sort(cmp);
}

/* ---------- Rendering helpers ---------- */

function plural(n, one, few, many) {
  const n10 = n % 10, n100 = n % 100;
  if (n === 1) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) e.append(c instanceof Node ? c : document.createTextNode(c));
  return e;
}

const icon = (name) => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `assets/icons.svg#${name}`);
  svg.append(use);
  return svg;
};

/** Returns a DocumentFragment with search tokens wrapped in <mark>. */
function highlight(text, toks) {
  const frag = document.createDocumentFragment();
  if (!toks.length || !text) {
    frag.append(text || '');
    return frag;
  }
  const f = fold(text);
  const ranges = [];
  for (const t of toks) {
    let i = f.indexOf(t);
    while (i >= 0) {
      ranges.push([i, i + t.length]);
      i = f.indexOf(t, i + t.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const chars = Array.from(text);
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    frag.append(chars.slice(pos, s).join(''));
    frag.append(el('mark', {}, chars.slice(s, e).join('')));
    pos = e;
  }
  frag.append(chars.slice(pos).join(''));
  return frag;
}

function timeLeft(end) {
  const ms = end - Date.now();
  if (ms <= 0) return { text: 'zakończona', soon: true };
  const h = ms / 3600000;
  if (h < 1) return { text: `${Math.max(1, Math.round(ms / 60000))} min`, soon: true };
  if (h < 48) return { text: `${Math.round(h)} h`, soon: h < 24 };
  const d = Math.round(h / 24);
  return { text: `${d} ${plural(d, 'dzień', 'dni', 'dni')}`, soon: false };
}

const tpl = $('#cardTpl');
const PLACEHOLDER = 'assets/placeholder.svg';

function renderCard(v, toks) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.style.setProperty('--c', `var(--t-${v.type})`);
  const media = $('.card__media', node);
  media.href = v.url;
  const img = $('img', node);
  img.src = v.image || PLACEHOLDER;
  img.alt = v.title;
  img.addEventListener('error', () => {
    if (!img.src.endsWith(PLACEHOLDER)) img.src = PLACEHOLDER;
  }, { once: true });
  $('.card__type', node).textContent = TYPE_LABEL[v.type] || v.type;

  if (v._end) {
    const left = timeLeft(v._end);
    const badge = $('.card__ending', node);
    badge.hidden = false;
    badge.classList.toggle('soon', left.soon);
    badge.title = `Koniec: ${fmtDate.format(new Date(v._end))}`;
    badge.append(icon('clock'), left.text);
  }

  const title = $('.card__title a', node);
  title.href = v.url;
  title.append(highlight(v.title, toks));
  const version = [v.version, v.bodyType].filter(Boolean).join(' · ');
  $('.card__version', node).textContent = version || (v.location ? `📍 ${v.location}` : '');

  const specs = [
    v.year,
    v.mileageKm != null ? `${fmtInt.format(v.mileageKm)} km` : null,
    v.fuel,
    v.gearbox,
    v.powerKm ? `${v.powerKm} KM` : null,
    v.engineCcm ? `${fmtInt.format(v.engineCcm)} cm³` : null,
    version && v.location ? v.location : null,
  ].filter(Boolean);
  $('.card__specs', node).append(...specs.map((s) => el('li', {}, String(s))));

  const price = $('.card__price', node);
  if (v.price) {
    const tax = v.priceGross === true ? 'brutto' : v.priceGross === false ? 'netto' : '';
    price.append(fmtPrice.format(v.price), el('small', {}, [v.priceLabel || v.saleType, tax].filter(Boolean).join(' · ') || 'cena'));
  } else {
    price.classList.add('none');
    price.append(v.saleType || 'Cena w ofercie');
  }
  const src = $('.card__source', node);
  src.href = v.url;
  src.textContent = v.sourceName;
  src.title = `Zobacz ofertę na ${v.sourceName}`;

  const fav = $('.fav-btn', node);
  const setFav = () => {
    const on = favorites.has(v.id);
    fav.setAttribute('aria-pressed', on);
    fav.title = on ? 'Usuń z ulubionych' : 'Dodaj do ulubionych';
  };
  setFav();
  fav.addEventListener('click', () => {
    favorites.has(v.id) ? favorites.delete(v.id) : favorites.add(v.id);
    localStorage.setItem('favorites', JSON.stringify([...favorites]));
    setFav();
    renderFavCount();
    if (state.favOnly) update();
  });
  return node;
}

function cardsGrid(list, toks) {
  const grid = el('div', { class: 'cards' });
  grid.append(...list.map((v) => renderCard(v, toks)));
  return grid;
}

/* ---------- Grouping ---------- */

const GROUPERS = {
  brand: { key: (v) => v.brand, label: (k) => k, order: 'alpha' },
  brandModel: { key: (v) => `${v.brand} ${v._model}`, label: (k) => k, order: 'alpha' },
  type: { key: (v) => v.type, label: (k) => TYPE_LABEL[k] || k, order: (a, b) => TYPES.findIndex((t) => t.id === a) - TYPES.findIndex((t) => t.id === b) },
  source: { key: (v) => v.sourceName, label: (k) => k, order: 'alpha' },
  year: { key: (v) => v.year || 'Brak roku', label: (k) => String(k), order: (a, b) => (+b || 0) - (+a || 0) },
  fuel: { key: (v) => v.fuel || 'Nieznane', label: (k) => k, order: 'count' },
};

function renderGroups(list, toks) {
  const g = GROUPERS[state.groupBy];
  const map = new Map();
  for (const v of list) {
    const k = g.key(v);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(v);
  }
  let keys = [...map.keys()];
  if (g.order === 'alpha') keys.sort((a, b) => (a === 'Inna') - (b === 'Inna') || String(a).localeCompare(String(b), 'pl'));
  else if (g.order === 'count') keys.sort((a, b) => map.get(b).length - map.get(a).length);
  else keys.sort(g.order);

  const frag = document.createDocumentFragment();
  keys.forEach((k, i) => {
    const items = map.get(k);
    const groupId = `${state.groupBy}:${k}`;
    const prices = items.map((v) => v.price).filter(Boolean);
    const meta = prices.length
      ? `od ${fmtPrice.format(Math.min(...prices))}${prices.length > 1 ? ` do ${fmtPrice.format(Math.max(...prices))}` : ''}`
      : '';
    const details = el('details', { class: 'group' });
    const isOpen = expandedGroups.has(groupId) ? expandedGroups.get(groupId) !== false : i < GROUPS_OPEN_BY_DEFAULT || keys.length <= GROUPS_OPEN_BY_DEFAULT;
    const summary = el('summary', {}, icon('chevron'), g.label(k), el('span', { class: 'g-count' }, fmtInt.format(items.length)), el('span', { class: 'g-meta' }, meta));
    if (state.groupBy === 'type') summary.insertBefore(icon(`t-${k}`), summary.childNodes[1]);
    $('svg', summary).classList.add('chev');
    details.append(summary);
    const body = el('div', { class: 'g-body' });
    details.append(body);

    let rendered = false;
    const fill = () => {
      if (rendered) return;
      rendered = true;
      if (state.groupBy === 'brand' && !state.models.size) {
        const models = [...countBy(items, (v) => v._model)].sort((a, b) => b[1] - a[1]);
        if (models.length > 1) {
          body.append(
            el('div', { class: 'subgroups' }, models.slice(0, 30).map(([m, c]) =>
              el('button', { type: 'button', title: `Pokaż tylko ${k} ${m}`, onclick: () => {
                state.brands = new Set([k]);
                state.models = new Set([`${k}|${m}`]);
                update();
              } }, `${m} (${c})`),
            )),
          );
        }
      }
      const limit = expandedGroups.get(groupId + ':limit') || GROUP_PREVIEW;
      body.append(cardsGrid(items.slice(0, limit), toks));
      if (items.length > limit) {
        body.append(
          el('div', { class: 'g-more' },
            el('button', { type: 'button', class: 'btn ghost', onclick: () => {
              expandedGroups.set(groupId + ':limit', items.length);
              rendered = false;
              body.replaceChildren();
              fill();
            } }, `Pokaż wszystkie (${fmtInt.format(items.length)})`),
          ),
        );
      }
    };
    details.addEventListener('toggle', () => {
      expandedGroups.set(groupId, details.open);
      if (details.open) fill();
    });
    if (isOpen) {
      details.open = true;
      fill();
    }
    frag.append(details);
  });
  return frag;
}

/* ---------- Sidebar ---------- */

function checkItem(label, value, count, checked, onChange) {
  const input = el('input', { type: 'checkbox', value, checked: checked || null });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: `check${!count && !checked ? ' is-empty' : ''}` }, input, el('span', { class: 'label', title: label }, label), el('span', { class: 'count' }, fmtInt.format(count || 0)));
}

function toggleIn(set, value, on) {
  on ? set.add(value) : set.delete(value);
  update();
}

function renderTypeTabs(counts) {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const nav = $('#typeTabs');
  const tab = (id, label, n, iconName) =>
    el('button', {
      type: 'button',
      class: 'type-tab',
      'aria-pressed': String(state.type === id),
      style: id ? `--c: var(--t-${id})` : null,
      disabled: id && !n && state.type !== id ? true : null,
      onclick: () => {
        state.type = state.type === id ? '' : id;
        update();
      },
    }, icon(iconName), label, el('span', { class: 'count' }, fmtInt.format(n)));
  nav.replaceChildren(
    tab('', 'Wszystkie', total, 't-all'),
    ...TYPES.filter((t) => t.always || counts.get(t.id) || state.type === t.id).map((t) => tab(t.id, t.label, counts.get(t.id) || 0, `t-${t.id}`)),
  );
  const active = nav.querySelector('[aria-pressed="true"]');
  if (active && nav.scrollWidth > nav.clientWidth) {
    const a = active.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    nav.scrollLeft += a.left - n.left - (n.width - a.width) / 2;
  }
}

function renderBrandList(counts) {
  const all = new Set([...counts.keys(), ...state.brands]);
  const q = fold(brandSearch);
  let brands = [...all].filter((b) => b && b !== '—' && (!q || fold(b).includes(q)));
  brands.sort((a, b) => state.brands.has(b) - state.brands.has(a) || (a === 'Inna') - (b === 'Inna') || a.localeCompare(b, 'pl'));
  const limited = !q && !showAllBrands && brands.length > BRAND_LIST_LIMIT;
  if (limited) {
    // Show most popular brands first when the list is collapsed.
    const top = new Set([...brands].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0)).slice(0, BRAND_LIST_LIMIT));
    brands = brands.filter((b) => top.has(b) || state.brands.has(b));
  }
  const list = $('#brandList');
  list.replaceChildren(...brands.map((b) => checkItem(b, b, counts.get(b), state.brands.has(b), (on) => {
    if (!on) for (const m of [...state.models]) if (m.startsWith(b + '|')) state.models.delete(m);
    toggleIn(state.brands, b, on);
  })));
  if (limited) list.append(el('button', { type: 'button', class: 'more', onclick: () => { showAllBrands = true; renderSidebar(lastFacets); } }, `Pokaż wszystkie marki (${all.size})`));
  if (!brands.length) list.append(el('p', { class: 'muted' }, 'Brak marek'));
}

function renderModelList(counts) {
  const group = $('#modelGroup');
  if (!state.brands.size) {
    group.hidden = true;
    return;
  }
  group.hidden = false;
  const keys = new Set([...state.models]);
  for (const v of vehicles) if (state.brands.has(v.brand)) keys.add(v._modelKey);
  const multi = state.brands.size > 1;
  const items = [...keys].sort((a, b) => a.localeCompare(b, 'pl'));
  $('#modelList').replaceChildren(...items.map((k) => {
    const [brand, model] = k.split('|');
    return checkItem(multi ? `${brand} ${model}` : model, k, counts.get(k), state.models.has(k), (on) => toggleIn(state.models, k, on));
  }));
}

function renderSimpleList(target, counts, selected, labelFn = (k) => k, order) {
  const keys = new Set([...counts.keys(), ...selected]);
  const items = [...keys].sort(order || ((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0)));
  $(target).replaceChildren(...items.map((k) => checkItem(k === '—' ? 'Nieznane' : labelFn(k), k, counts.get(k), selected.has(k), (on) => toggleIn(selected, k, on))));
}

function renderSources(counts) {
  const ids = new Set([...sources.map((s) => s.id), ...counts.keys()]);
  const names = new Map(sources.map((s) => [s.id, s.name]));
  for (const v of vehicles) if (!names.has(v.source)) names.set(v.source, v.sourceName);
  const items = [...ids].filter((id) => id !== '—').sort((a, b) => (names.get(a) || a).localeCompare(names.get(b) || b, 'pl'));
  $('#sourceList').replaceChildren(...items.map((id) => checkItem(names.get(id) || id, id, counts.get(id), state.sources.has(id), (on) => toggleIn(state.sources, id, on))));

  $('#sourcesStatus').replaceChildren(...sources.map((s) => {
    const cls = s.ok ? '' : s.stale ? 'warn' : 'err';
    const info = s.ok
      ? `${fmtInt.format(s.count)} ofert`
      : s.stale
        ? `dane z ${s.lastSuccess ? fmtDate.format(new Date(s.lastSuccess)) : 'poprzedniej aktualizacji'}`
        : s.error || 'niedostępny';
    return el('li', {}, el('span', { class: `dot ${cls}` }), el('div', {}, el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.name), el('small', { title: s.note || s.error || '' }, info)));
  }));
}

let lastFacets = null;
function renderSidebar(f) {
  lastFacets = f;
  renderBrandList(f.brand);
  renderModelList(f.model);
  renderSimpleList('#fuelList', f.fuel, state.fuels);
  renderSimpleList('#gearList', f.gear, state.gears);
  renderSources(f.source);
  for (const b of document.querySelectorAll('#endingChips .chip')) b.setAttribute('aria-pressed', String(b.dataset.ending === state.ending));
}

function renderActiveFilters() {
  const pills = [];
  const pill = (text, onRemove) => pills.push(el('button', { type: 'button', class: 'pill', title: 'Usuń filtr', onclick: () => { onRemove(); update(); } }, text, icon('close')));
  if (state.q) pill(`„${state.q}”`, () => { state.q = ''; $('#q').value = ''; });
  if (state.type) pill(TYPE_LABEL[state.type], () => (state.type = ''));
  for (const b of state.brands) pill(b, () => {
    state.brands.delete(b);
    for (const m of [...state.models]) if (m.startsWith(b + '|')) state.models.delete(m);
  });
  for (const m of state.models) pill(m.replace('|', ' '), () => state.models.delete(m));
  const srcName = new Map(sources.map((s) => [s.id, s.name]));
  for (const s of state.sources) pill(srcName.get(s) || s, () => state.sources.delete(s));
  for (const f of state.fuels) pill(f === '—' ? 'Paliwo: nieznane' : f, () => state.fuels.delete(f));
  for (const g of state.gears) pill(g === '—' ? 'Skrzynia: nieznana' : g, () => state.gears.delete(g));
  const range = (a, b, unit, ka, kb) => {
    if (state[ka] == null && state[kb] == null) return;
    const t = state[ka] != null && state[kb] != null ? `${fmtInt.format(state[ka])}–${fmtInt.format(state[kb])}` : state[ka] != null ? `od ${fmtInt.format(state[ka])}` : `do ${fmtInt.format(state[kb])}`;
    pill(`${a}: ${t}${unit}`, () => { state[ka] = null; state[kb] = null; });
  };
  range('Cena', null, ' zł', 'priceMin', 'priceMax');
  range('Rok', null, '', 'yearMin', 'yearMax');
  range('Przebieg', null, ' km', 'kmMin', 'kmMax');
  if (state.withPrice) pill('Z ceną', () => (state.withPrice = false));
  if (state.ending) pill(`Kończy się w ${state.ending} h`, () => (state.ending = ''));
  if (state.favOnly) pill('Ulubione', () => (state.favOnly = false));
  $('#activeFilters').replaceChildren(...pills);
}

function renderFavCount() {
  const b = $('#favCount');
  b.hidden = !favorites.size;
  b.textContent = favorites.size;
  $('#favToggle').setAttribute('aria-pressed', String(state.favOnly));
}

/* ---------- Main update ---------- */

function update({ keepLimit = false } = {}) {
  if (!keepLimit) state.limit = PAGE_SIZE;
  writeUrl();
  syncInputs();
  const toks = tokens();
  const facets = facetCounts(toks);
  const list = sortList(vehicles.filter((v) => matches(v, toks)), toks);

  renderTypeTabs(facets.type);
  renderSidebar(facets);
  renderActiveFilters();
  renderFavCount();

  $('#resultCount').textContent = fmtInt.format(list.length);
  $('#resultLabel').textContent = plural(list.length, 'pojazd', 'pojazdy', 'pojazdów');

  const out = $('#output');
  out.dataset.view = state.view;
  for (const b of document.querySelectorAll('.segmented button')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));

  if (!list.length) {
    out.replaceChildren(
      el('div', { class: 'empty' },
        el('h3', {}, vehicles.length ? 'Brak pojazdów spełniających kryteria' : 'Brak danych'),
        el('p', {}, vehicles.length ? 'Spróbuj zmienić lub usunąć część filtrów.' : 'Dane nie zostały jeszcze pobrane – uruchom scraper (npm run scrape).'),
        vehicles.length ? el('button', { type: 'button', class: 'btn', onclick: resetFilters }, 'Wyczyść filtry') : null,
      ),
    );
    $('#pager').hidden = true;
    return;
  }

  if (state.groupBy && GROUPERS[state.groupBy]) {
    out.replaceChildren(renderGroups(list, toks));
    $('#pager').hidden = true;
  } else {
    out.replaceChildren(cardsGrid(list.slice(0, state.limit), toks));
    $('#pager').hidden = list.length <= state.limit;
    $('#loadMore').textContent = `Pokaż więcej (${fmtInt.format(list.length - state.limit)})`;
  }
}

function loadMore() {
  const toks = tokens();
  const list = sortList(vehicles.filter((v) => matches(v, toks)), toks);
  const grid = $('#output .cards');
  const next = list.slice(state.limit, state.limit + PAGE_SIZE);
  state.limit += PAGE_SIZE;
  grid.append(...next.map((v) => renderCard(v, toks)));
  $('#pager').hidden = list.length <= state.limit;
  $('#loadMore').textContent = `Pokaż więcej (${fmtInt.format(Math.max(0, list.length - state.limit))})`;
}

function syncInputs() {
  if (document.activeElement !== $('#q')) $('#q').value = state.q;
  for (const [k] of Object.entries(NUM_KEYS)) {
    const input = $(`#${k}`);
    if (document.activeElement !== input) input.value = state[k] ?? '';
  }
  $('#withPrice').checked = state.withPrice;
  $('#groupBy').value = state.groupBy;
  $('#sortBy').value = state.sortBy;
}

function resetFilters() {
  Object.assign(state, {
    q: '', type: '', brands: new Set(), models: new Set(), sources: new Set(), fuels: new Set(), gears: new Set(),
    priceMin: null, priceMax: null, yearMin: null, yearMax: null, kmMin: null, kmMax: null, withPrice: false, ending: '', favOnly: false,
  });
  brandSearch = '';
  $('#brandSearch').value = '';
  update();
}

/* ---------- Events ---------- */

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function bindEvents() {
  const q = $('#q');
  q.addEventListener('input', debounce(() => { state.q = q.value.trim(); update(); }, 180));
  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); state.q = q.value.trim(); update(); q.blur(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      q.focus();
    }
    if (e.key === 'Escape') closeFilters();
  });

  for (const k of Object.keys(NUM_KEYS)) {
    $(`#${k}`).addEventListener('input', debounce((e) => {
      const v = e.target.value.trim();
      state[k] = v === '' ? null : +v;
      update();
    }, 400));
  }
  $('#withPrice').addEventListener('change', (e) => { state.withPrice = e.target.checked; update(); });
  $('#brandSearch').addEventListener('input', (e) => { brandSearch = e.target.value; renderBrandList(lastFacets.brand); });
  $('#endingChips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (b) { state.ending = b.dataset.ending; update(); }
  });
  $('#groupBy').addEventListener('change', (e) => {
    state.groupBy = e.target.value;
    localStorage.setItem('groupBy', state.groupBy);
    expandedGroups.clear();
    update();
  });
  $('#sortBy').addEventListener('change', (e) => { state.sortBy = e.target.value; update(); });
  for (const b of document.querySelectorAll('.segmented button')) {
    b.addEventListener('click', () => {
      state.view = b.dataset.view;
      localStorage.setItem('view', state.view);
      update({ keepLimit: true });
    });
  }
  $('#loadMore').addEventListener('click', loadMore);
  $('#resetFilters').addEventListener('click', resetFilters);
  $('#favToggle').addEventListener('click', () => { state.favOnly = !state.favOnly; update(); });
  $('#themeToggle').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    localStorage.setItem('theme', document.documentElement.dataset.theme);
  });
  $('#filtersOpen').addEventListener('click', openFilters);
  $('#filtersClose').addEventListener('click', closeFilters);
  $('#filtersBackdrop').addEventListener('click', closeFilters);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !$('#pager').hidden) loadMore();
    }, { rootMargin: '600px' }).observe($('#pager'));
  }
}

function openFilters() {
  $('#filters').classList.add('open');
  $('#filtersBackdrop').hidden = false;
}
function closeFilters() {
  $('#filters').classList.remove('open');
  $('#filtersBackdrop').hidden = true;
}

function setRepoLink() {
  const m = /^([\w-]+)\.github\.io$/.exec(location.hostname);
  const link = $('#repoLink');
  if (m) {
    const repo = location.pathname.split('/').filter(Boolean)[0];
    link.href = repo ? `https://github.com/${m[1]}/${repo}` : `https://github.com/${m[1]}`;
  }
}

async function init() {
  readUrl();
  bindEvents();
  setRepoLink();
  try {
    await loadData();
  } catch (e) {
    $('#output').replaceChildren(el('div', { class: 'empty' }, el('h3', {}, 'Nie udało się wczytać danych'), el('p', {}, String(e.message))));
    return;
  }
  update();
}

init();
