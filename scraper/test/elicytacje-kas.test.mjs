import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTitle } from '../sources/elicytacje-kas.mjs';
import { normalizeVehicle } from '../lib/normalize.mjs';

const src = { id: 'elicytacje-kas', name: 'eLicytacje KAS', url: 'https://elicytacje.mf.gov.pl/auction/' };
const vehicle = (title) => {
  const p = parseTitle(title);
  return normalizeVehicle({ id: '1', url: 'https://elicytacje.mf.gov.pl/auction/announcements/1', ...p, category: p.kind }, src);
};

test('tax-office titles are reduced to make and model with year extracted', () => {
  const cases = [
    ['SAMOCHÓD OSOBOWY FORD FOCUS', 'Ford Focus', undefined],
    ['RENAULT SCENIC , ROK PROD. 2003', 'Renault Scenic', 2003],
    ['Samochód osobowy Peugeot 308 SW, 2008 rok.', 'Peugeot 308 SW', 2008],
    ['Seat Toledo r. prod. 2014', 'Seat Toledo', 2014],
    ['Audi A6 z 2011 r.', 'Audi A6', 2011],
    ['VOLKSWAGEN, TOUAREG, ROK PRODUKCJI 2018', 'Volkswagen Touareg', 2018],
    ['Toyota Avensis WPR 9035S', 'Toyota Avensis', undefined],
    ['SAMOCHÓD OSOBOWY DACIA LOGAN 2007', 'Dacia Logan', 2007],
    ['MOTOROWER MARKI PEUGEOT', 'Peugeot', undefined],
  ];
  for (const [title, name, year] of cases) {
    assert.equal(vehicle(title).title, name, title);
    assert.equal(parseTitle(title).year, year, title);
  }
});

test('registration, engine and power details are parsed out of the title', () => {
  const p = parseTitle('Opel Movano rok prod. 2003, poj. 2463 cm, moc 84KW (114 KM), DIESEL');
  assert.deepEqual(
    { title: p.title, year: p.year, engineCcm: p.engineCcm, powerKm: p.powerKm, fuel: p.fuel },
    { title: 'Opel Movano', year: 2003, engineCcm: 2463, powerKm: 114, fuel: 'Diesel' },
  );
  const n = parseTitle('Naczepa ciężarowa Krone SD, rok prod.  2017, nr rej. KBC 9N19');
  assert.equal(n.title, 'Krone SD');
  assert.equal(n.year, 2017);
});

test('vehicle kind words drive the type, but "ciężarowy" does not force a truck', () => {
  assert.equal(vehicle('samochód ciężarowy Fiat Ducato 33').type, 'dostawcze');
  assert.equal(vehicle('SAMOCHÓD CIĘŻAROWY KIA SORENTO, WIELOZADANIOWY, ROK 2010').type, 'osobowe');
  assert.equal(vehicle('MAN, TGX, ciągnik samochodowy, siodłowy').type, 'ciezarowe');
  assert.equal(vehicle('motorower ROMET MOTORS 767').type, 'motocykle');
  assert.equal(vehicle('CARNEHL NACZEPA CIĘŻAROWA WYWROTKA rok prod. 2021, nr rej. CZN2M18').type, 'przyczepy');
  assert.equal(vehicle('FS LUBLIN 3504, 1999').type, 'dostawcze');
});
