/**
 * EFL Aukcje (aukcje.efl.com.pl) – EFL's own vehicle & machinery auctions.
 * The site also hosts a "Carefleet" category tree; that one is scraped by carefleet.mjs.
 * See _efl-platform.mjs for the listing/detail parsing.
 */
import { EFL_BASE, scrapeEfl } from './_efl-platform.mjs';

const CATEGORIES = [
  { slug: 'Pojazdy/Osobowe', category: 'Osobowe' },
  { slug: 'Pojazdy/Dostawcze', category: 'Dostawcze' },
  { slug: 'Pojazdy/Ciezarowe', category: 'Ciężarowe' },
  { slug: 'Pojazdy/Motocykle-i-quady', category: 'Motocykle i quady' },
  { slug: 'Pojazdy/Naczepy-i-przyczepy', category: 'Naczepy i przyczepy' },
  // Root category last: picks up vehicles from "Pozostałe" or without a subcategory.
  { slug: 'Pojazdy', category: undefined },
  { slug: 'Maszyny-i-urzadzenia/Maszyny-i-sprzet-budowlany', category: 'Maszyny budowlane' },
  { slug: 'Maszyny-i-urzadzenia/Maszyny-rolnicze-i-lesne', category: 'Maszyny rolnicze i leśne' },
];

export default {
  id: 'efl',
  name: 'EFL Aukcje',
  url: `${EFL_BASE}/`,
  async scrape({ http, log, maxPages }) {
    const out = await scrapeEfl({ http, log, maxPages, categories: CATEGORIES, detailLimit: 200 });
    log(`${out.length} rekordów`);
    return out;
  },
};
