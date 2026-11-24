import { test } from 'node:test';
import assert from 'node:assert/strict';
import source from '../sources/poleasingowe.mjs';
import { normalizeVehicle } from '../lib/normalize.mjs';

const card = (id, imageAttr, labels, time) => `
<div class="auction-element pb-4" data-auction-id="${id}">
  <div class="image-container">
    <a href="https://poleasingowe.pl/pl/auctions/details/mercedes-benz-c-200-sedan/${id}?source=">
      <div class="image" ${imageAttr}></div>
    </a>
  </div>
  <div class="primary-container">
    <h2 class="header-small"><a href="https://poleasingowe.pl/pl/auctions/details/mercedes-benz-c-200-sedan/${id}?source="><span>MERCEDES-BENZ C 200 SEDAN</span></a></h2>
    <div class="filter-labels">${labels.map((l) => `<div class="filter-label">${l}</div>`).join('')}</div>
    <div class="otter-card__location"><span>Lokalizacja:</span> <strong>Tarczyn, Żytnia 2</strong></div>
    <div class="otter-card__time"><strong>${time}</strong></div>
  </div>
  <div class="secondary-container">
    <span class="listing-price-label">Aktualna cena</span>
    <span class="listing-price">100 400 <span class="listing-price-currency">PLN</span></span>
  </div>
</div>`;

const page = `<html><body><form id="topsearchform"></form>
${card('1', 'data-bg-image="https://poleasingowe.pl/images/list_a_108.png"', ['2023', '204 KM', 'Hybryda/benzyna', '71111 km'], 'za 13 minut <span>(24-11-2026 10:00)</span>')}
${card('2', 'data-lazy-bg="https://poleasingowe.pl/images/list_b_553.png"', ['2021', '120 km', '150 KM'], 'za 2 dni (26-11-2026 18:30)')}
</body></html>`;

test('current card markup: photo, location, exact end time, power separate from mileage', async () => {
  const http = { text: async (url) => (url.includes('ecr_cartypess') ? page : '<form id="topsearchform"></form>') };
  const raws = await source.scrape({ http, log: () => {}, maxPages: 1 });
  const [a, b] = raws.map((r) => normalizeVehicle(r, source));

  assert.equal(a.image, 'https://poleasingowe.pl/images/list_a_108.png');
  assert.equal(b.image, 'https://poleasingowe.pl/images/list_b_553.png');
  assert.equal(a.location, 'Tarczyn');
  assert.equal(a.endDate, '2026-11-24T09:00:00.000Z');
  assert.equal(b.endDate, '2026-11-26T17:30:00.000Z');
  assert.equal(a.powerKm, 204);
  assert.equal(a.mileageKm, 71111);
  assert.equal(b.powerKm, 150);
  assert.equal(b.mileageKm, 120);
  assert.equal(a.year, 2023);
});
