#!/usr/bin/env node
/**
 * Runs every source module in scraper/sources, normalizes results and writes
 * site/data/vehicles.json + site/data/sources.json consumed by the static website.
 *
 * Usage:
 *   node scraper/index.mjs                 # all sources
 *   node scraper/index.mjs --only cararena,efl
 *   MAX_PAGES=2 node scraper/index.mjs     # limit pagination (quick test)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHttp } from './lib/http.mjs';
import { normalizeVehicle } from './lib/normalize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'site', 'data');
const SOURCES_DIR = path.join(__dirname, 'sources');

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? new Set((args[onlyIdx + 1] || '').split(',').filter(Boolean)) : null;
const MAX_PAGES = +(process.env.MAX_PAGES || 50);
const SOURCE_TIMEOUT_MS = +(process.env.SOURCE_TIMEOUT_MS || 8 * 60 * 1000);
const CONCURRENCY = +(process.env.CONCURRENCY || 4);
/** Vehicles from a failing source are kept for this long so the site doesn't go empty on transient errors. */
const STALE_KEEP_MS = 3 * 24 * 3600 * 1000;

async function loadSources() {
  const files = (await fs.readdir(SOURCES_DIR)).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
  const mods = [];
  for (const f of files) {
    const mod = (await import(pathToFileURL(path.join(SOURCES_DIR, f)).href)).default;
    if (!mod?.id || typeof mod.scrape !== 'function') {
      console.warn(`[skip] ${f}: brak eksportu default { id, scrape }`);
      continue;
    }
    if (only && !only.has(mod.id)) continue;
    mods.push(mod);
  }
  return mods;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => (t = setTimeout(() => rej(new Error(`Timeout ${ms}ms: ${label}`)), ms))),
  ]);
}

async function runSource(source) {
  const started = Date.now();
  const http = createHttp({ delayMs: source.delayMs ?? 300 });
  const log = (...a) => console.log(`[${source.id}]`, ...a);
  const seen = new Set();
  const vehicles = [];
  try {
    const raw = await withTimeout(source.scrape({ http, log, maxPages: MAX_PAGES }), SOURCE_TIMEOUT_MS, source.id);
    for (const r of raw || []) {
      if (!r || (!r.title && !r.brand)) continue;
      const v = normalizeVehicle(r, source);
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      vehicles.push(v);
    }
    log(`OK: ${vehicles.length} pojazdów w ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return { source, vehicles, status: { ok: true, count: vehicles.length, durationMs: Date.now() - started } };
  } catch (e) {
    log(`BŁĄD: ${e.message}`);
    return {
      source,
      vehicles,
      status: { ok: false, count: vehicles.length, error: String(e.message || e).slice(0, 300), durationMs: Date.now() - started },
    };
  }
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const sources = await loadSources();
  if (!sources.length) throw new Error('Nie znaleziono źródeł do uruchomienia');
  console.log(`Uruchamiam ${sources.length} źródeł: ${sources.map((s) => s.id).join(', ')}`);

  const prevVehicles = await readJson(path.join(DATA_DIR, 'vehicles.json'), { vehicles: [] });
  const prevSources = await readJson(path.join(DATA_DIR, 'sources.json'), { sources: [] });
  const prevBySource = new Map();
  for (const v of prevVehicles.vehicles || []) {
    if (!prevBySource.has(v.source)) prevBySource.set(v.source, []);
    prevBySource.get(v.source).push(v);
  }
  const prevStatus = new Map((prevSources.sources || []).map((s) => [s.id, s]));

  const now = new Date().toISOString();
  const results = await pool(sources, CONCURRENCY, runSource);

  const all = [];
  const statuses = [];
  const ranIds = new Set();
  for (const { source, vehicles, status } of results) {
    ranIds.add(source.id);
    const prev = prevStatus.get(source.id);
    let list = vehicles.map((v) => ({ ...v, firstSeen: v.firstSeen ?? now, lastSeen: now }));
    const prevList = prevBySource.get(source.id) || [];
    const prevById = new Map(prevList.map((v) => [v.id, v]));
    list = list.map((v) => ({ ...v, firstSeen: prevById.get(v.id)?.firstSeen ?? now }));

    let stale = false;
    if (!status.ok || list.length === 0) {
      const lastOk = prev?.lastSuccess ? Date.parse(prev.lastSuccess) : 0;
      if (prevList.length && Date.now() - lastOk < STALE_KEEP_MS) {
        list = prevList;
        stale = true;
      }
    }
    all.push(...list);
    statuses.push({
      id: source.id,
      name: source.name,
      url: source.url,
      ok: status.ok && vehicles.length > 0,
      count: list.length,
      stale,
      error: status.error || (status.ok && vehicles.length === 0 ? 'Brak ofert lub zmieniła się struktura strony' : null),
      durationMs: status.durationMs,
      lastRun: now,
      lastSuccess: status.ok && vehicles.length > 0 ? now : prev?.lastSuccess ?? null,
      note: source.note ?? null,
    });
  }

  // With --only, keep the other sources' data untouched.
  if (only) {
    for (const [id, list] of prevBySource) if (!ranIds.has(id)) all.push(...list);
    for (const [id, st] of prevStatus) if (!ranIds.has(id)) statuses.push(st);
  }

  all.sort((a, b) => (a.brand || '').localeCompare(b.brand || '', 'pl') || (a.model || '').localeCompare(b.model || '', 'pl'));
  statuses.sort((a, b) => a.name.localeCompare(b.name, 'pl'));

  await fs.writeFile(path.join(DATA_DIR, 'vehicles.json'), JSON.stringify({ generatedAt: now, count: all.length, vehicles: all }));
  await fs.writeFile(path.join(DATA_DIR, 'sources.json'), JSON.stringify({ generatedAt: now, sources: statuses }, null, 2));

  console.log(`\nZapisano ${all.length} pojazdów.`);
  console.table(statuses.map(({ id, ok, count, stale, error }) => ({ id, ok, count, stale, error: error?.slice(0, 60) })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
