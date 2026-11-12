import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, calendarLinks, hasCalendar } from '../../site/assets/calendar.js';

const end = Date.parse('2030-11-12T14:00:00Z');
const vehicle = {
  id: 'cararena:123',
  title: 'Škoda Octavia 2.0 TDI, Style; Kombi',
  url: 'https://cararena.pl/aukcja/123',
  sourceName: 'CarArena',
  location: 'Warszawa',
  price: 45900,
  priceLabel: 'Aktualna cena',
  priceGross: true,
  year: 2021,
  mileageKm: 120000,
  fuel: 'Diesel',
  _end: end,
};

test('hasCalendar only for auctions that have not ended', () => {
  assert.equal(hasCalendar(vehicle), true);
  assert.equal(hasCalendar({ ...vehicle, _end: Date.now() - 1000 }), false);
  assert.equal(hasCalendar({ ...vehicle, _end: null }), false);
});

test('calendar links carry the event window ending at the auction end', () => {
  const l = calendarLinks(vehicle);
  const g = new URL(l.google);
  assert.equal(g.searchParams.get('action'), 'TEMPLATE');
  assert.equal(g.searchParams.get('dates'), '20301112T134500Z/20301112T140000Z');
  assert.match(g.searchParams.get('text'), /^Koniec licytacji: Škoda Octavia/);
  assert.match(g.searchParams.get('details'), /https:\/\/cararena\.pl\/aukcja\/123/);
  const y = new URL(l.yahoo);
  assert.equal(y.searchParams.get('st'), '20301112T134500Z');
  assert.equal(y.searchParams.get('et'), '20301112T140000Z');
  const o = new URL(l.outlook);
  assert.equal(o.searchParams.get('enddt'), '2030-11-12T14:00:00.000Z');
});

test('ics is valid RFC 5545 with escaped text, folded lines and alarms', () => {
  const ics = buildIcs([vehicle, { ...vehicle, id: 'x:ended', _end: Date.now() - 1000 }]);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 1, 'ended auctions are skipped');
  assert.match(ics, /DTSTART:20301112T134500Z\r\n/);
  assert.match(ics, /DTEND:20301112T140000Z\r\n/);
  assert.match(ics, /SUMMARY:Koniec licytacji: Škoda Octavia 2\.0 TDI\\, Style\\; Kombi/);
  assert.deepEqual(ics.match(/TRIGGER:[^\r]+/g), ['TRIGGER:-PT45M', 'TRIGGER:-PT0M']);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /DESCRIPTION:Koniec licytacji: .*\\nOferta: https:\/\/cararena\.pl\/aukcja\/123/);
});
