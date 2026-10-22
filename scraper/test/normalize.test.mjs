import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyType,
  detectBrand,
  normalizeVehicle,
  parseDate,
  parseMileage,
  parseNumber,
  typeFromCategory,
} from '../lib/normalize.mjs';

test('parseNumber handles Polish formatting', () => {
  assert.equal(parseNumber('123 456 zł'), 123456);
  assert.equal(parseNumber('45\u00a0900,00 PLN'), 45900);
  assert.equal(parseNumber('12.500'), 12500);
  assert.equal(parseNumber('1234.5'), 1234.5);
  assert.equal(parseNumber(''), null);
});

test('parseMileage', () => {
  assert.equal(parseMileage('154 300 km'), 154300);
  assert.equal(parseMileage('120 tys. km'), 120000);
  assert.equal(parseMileage(98000), 98000);
});

test('parseDate converts Polish local time to UTC', () => {
  assert.equal(parseDate('22.10.2026 14:00'), '2026-10-22T12:00:00.000Z');
  assert.equal(parseDate('15.01.2026 10:30'), '2026-01-15T09:30:00.000Z');
  assert.equal(parseDate('2026-10-22T12:00:00Z'), '2026-10-22T12:00:00.000Z');
});

test('detectBrand finds multi-word and aliased brands', () => {
  assert.deepEqual(detectBrand('Mercedes-Benz Sprinter 316 CDI'), { brand: 'Mercedes-Benz', rest: 'Sprinter 316 CDI' });
  assert.equal(detectBrand('VW Passat 2.0 TDI').brand, 'Volkswagen');
  assert.equal(detectBrand('Land Rover Discovery Sport').brand, 'Land Rover');
  assert.equal(detectBrand('Skoda Octavia').brand, 'Škoda');
  assert.equal(detectBrand('Samochód osobowy Toyota Corolla').brand, 'Toyota');
});

test('typeFromCategory maps site categories', () => {
  assert.equal(typeFromCategory('Samochody osobowe'), 'osobowe');
  assert.equal(typeFromCategory('Dostawcze do 3,5t'), 'dostawcze');
  assert.equal(typeFromCategory('Ciężarowe pow. 3,5 t'), 'ciezarowe');
  assert.equal(typeFromCategory('Naczepy'), 'przyczepy');
  assert.equal(typeFromCategory('Maszyny budowlane'), 'maszyny');
});

test('classifyType uses model heuristics', () => {
  assert.equal(classifyType({ title: 'Ford Transit Custom 2.0 EcoBlue', brand: 'Ford' }), 'dostawcze');
  assert.equal(classifyType({ title: 'Renault Master L3H2 Furgon', brand: 'Renault' }), 'dostawcze');
  assert.equal(classifyType({ title: 'Skoda Octavia Combi 2.0 TDI', brand: 'Škoda' }), 'osobowe');
  assert.equal(classifyType({ title: 'Scania R450 ciągnik siodłowy', brand: 'Scania' }), 'ciezarowe');
  assert.equal(classifyType({ title: 'MAN TGX 18.510', brand: 'MAN' }), 'ciezarowe');
  assert.equal(classifyType({ title: 'Schmitz Cargobull SCS naczepa firanka', brand: 'Schmitz Cargobull' }), 'przyczepy');
  // Polish registration lists vans as "ciężarowy" – the model hint wins.
  assert.equal(classifyType({ title: 'Opel Combo Cargo', brand: 'Opel', category: 'Ciężarowe' }), 'dostawcze');
  assert.equal(classifyType({ title: 'Volvo XC60 B4', brand: 'Volvo' }), 'osobowe');
  assert.equal(classifyType({ title: 'Volvo EX30 Twin Motor Performance', brand: 'Volvo' }), 'osobowe');
  assert.equal(classifyType({ title: 'Mercedes-Benz Atego 1224', brand: 'Mercedes-Benz', category: 'Ciężarowe' }), 'ciezarowe');
  assert.equal(classifyType({ title: 'Iveco Daily 70C18 kontener', brand: 'Iveco', category: 'Ciężarowe' }), 'ciezarowe');
  assert.equal(classifyType({ title: 'Iveco Daily 35S16 furgon', brand: 'Iveco', category: 'Ciężarowe' }), 'dostawcze');
});

test('normalizeVehicle produces the website schema', () => {
  const v = normalizeVehicle(
    { id: 'A1', url: '/oferta/1', title: 'Toyota Corolla 1.8 Hybrid', price: '59 900 zł', year: '2021', mileage: '88 000 km', gearbox: 'automat' },
    { id: 'test', name: 'Test', url: 'https://example.com/' },
  );
  assert.equal(v.id, 'test:A1');
  assert.equal(v.url, 'https://example.com/oferta/1');
  assert.equal(v.brand, 'Toyota');
  assert.equal(v.model, 'Corolla 1.8');
  assert.equal(v.type, 'osobowe');
  assert.equal(v.price, 59900);
  assert.equal(v.year, 2021);
  assert.equal(v.mileageKm, 88000);
  assert.equal(v.fuel, 'Hybryda');
  assert.equal(v.gearbox, 'Automatyczna');
});
