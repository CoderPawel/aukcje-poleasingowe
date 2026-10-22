# Aukcje Poleasingowe – wyszukiwarka aut z wielu portali

Statyczna strona (GitHub Pages) zbierająca w jednym miejscu pojazdy z aukcji poleasingowych.
Pojazdy można **wyszukiwać**, **filtrować** i **grupować** po marce, marce i modelu, typie
(osobowe / dostawcze / ciężarowe / przyczepy / motocykle / maszyny), portalu, roku i paliwie.

Dane są pobierane automatycznie przez GitHub Actions (domyślnie co 4 godziny) i zapisywane w
`site/data/vehicles.json`. Strona nie potrzebuje żadnego serwera ani bazy danych.

## Obsługiwane portale

| Portal | Moduł |
| --- | --- |
| [CarArena](https://cararena.pl/) | `scraper/sources/cararena.mjs` |
| [Poleasingowe.pl](https://poleasingowe.pl/) | `scraper/sources/poleasingowe.mjs` |
| [FM Leasing](https://www.fmleasing.pl/) | `scraper/sources/fmleasing.mjs` |
| [mLeasing – portal aukcyjny](https://portalaukcyjny.mleasing.pl/) | `scraper/sources/mleasing.mjs` |
| [Automarket](https://automarket.pl/) | `scraper/sources/automarket.mjs` |
| [Famat Aukcje](https://famataukcje.pl) | `scraper/sources/famat.mjs` |
| [AutoPrzetarg](https://autoprzetarg.pl) | `scraper/sources/autoprzetarg.mjs` |
| [Arval AutoSelect](https://autoselect.arval.pl/) | `scraper/sources/arval.mjs` |
| [mAuto](https://mauto.pl/) | `scraper/sources/mauto.mjs` |
| [Carefleet – poleasingowe](https://poleasingowe.carefleet.pl/) | `scraper/sources/carefleet.mjs` |
| [PKO Leasing – aukcje](https://aukcje.pkoleasing.pl/) | `scraper/sources/pkoleasing.mjs` |
| [Leasy Group – aukcje](https://aukcje.leasygroup.pl/) | `scraper/sources/leasygroup.mjs` |
| [EFL – aukcje](https://aukcje.efl.com.pl/) | `scraper/sources/efl.mjs` |

Aktualny stan każdego portalu (liczba ofert, ewentualny błąd) widać na stronie w panelu
**Filtry → Status portali** oraz w pliku `site/data/sources.json`.

## Funkcje strony

- wyszukiwanie pełnotekstowe (marka, model, wersja, VIN, lokalizacja) – bez względu na polskie znaki,
- zakładki typów pojazdów: osobowe, dostawcze, ciężarowe (+ przyczepy, motocykle, maszyny, jeśli występują),
- grupowanie: po marce (z szybkim wyborem modelu), po marce i modelu, po typie, po portalu, po roku, po paliwie,
- filtry: marka, model, cena, rok, przebieg, paliwo, skrzynia biegów, portal, czas do końca aukcji,
- liczniki przy każdym filtrze (faceted search), aktywne filtry jako „pigułki”,
- sortowanie: cena, rok, przebieg, koniec aukcji, ostatnio dodane, nazwa,
- widok kafelków lub listy, tryb ciemny, ulubione (zapamiętywane w przeglądarce),
- stan filtrów zapisany w adresie URL – link do wyników można wysłać innej osobie,
- responsywny układ (telefon / tablet / komputer).

## Publikacja na GitHub (krok po kroku)

1. Utwórz nowe repozytorium na GitHub (np. `aukcje-poleasingowe`).
2. Wgraj zawartość tego katalogu:
   ```bash
   git init -b main
   git add .
   git commit -m "Wyszukiwarka aut poleasingowych"
   git remote add origin https://github.com/<twoj-login>/aukcje-poleasingowe.git
   git push -u origin main
   ```
3. W repozytorium wejdź w **Settings → Pages** i w polu **Source** wybierz **GitHub Actions**.
4. Wejdź w **Settings → Actions → General → Workflow permissions** i zaznacz
   **Read and write permissions** (workflow zapisuje pobrane dane do repozytorium).
5. W zakładce **Actions** uruchom ręcznie workflow **„Aktualizacja danych i publikacja strony”**
   (przycisk *Run workflow*). Po kilku minutach strona będzie dostępna pod adresem
   `https://<twoj-login>.github.io/aukcje-poleasingowe/`.

Później workflow uruchamia się sam co 4 godziny (zmienisz to w `.github/workflows/update-and-deploy.yml`,
pole `cron`) oraz po każdym pushu do gałęzi `main`.

> GitHub automatycznie wyłącza zaplanowane workflow w repozytoriach bez aktywności przez 60 dni –
> wystarczy wtedy ponownie włączyć go w zakładce *Actions*.

## Uruchomienie lokalne

Wymagany Node.js 20 lub nowszy.

```bash
npm install
npm run scrape            # pobiera dane ze wszystkich portali do site/data/
npm run serve             # podgląd strony: http://localhost:8080
```

Przydatne opcje:

```bash
node scraper/index.mjs --only cararena,efl   # tylko wybrane portale (reszta danych zostaje)
MAX_PAGES=2 npm run scrape                   # szybki test – maks. 2 strony wyników na portal
npm test                                     # testy normalizacji i klasyfikacji pojazdów
```

## Jak to działa

```
scraper/
  index.mjs            – uruchamia wszystkie moduły, normalizuje dane, zapisuje JSON
  lib/http.mjs         – fetch z ponawianiem, limitem czasu, opóźnieniem i obsługą ciasteczek
  lib/normalize.mjs    – rozpoznawanie marki, typu pojazdu, ceny, przebiegu, paliwa, dat
  sources/*.mjs        – po jednym module na portal
  test/                – testy (node --test)
site/
  index.html, assets/  – strona (czysty HTML/CSS/JS, bez kroku budowania)
  data/vehicles.json   – pojazdy (generowane)
  data/sources.json    – status portali (generowane)
```

**Typ pojazdu** jest ustalany w kolejności: kategoria podana przez portal → marka (np. Scania, DAF,
producenci naczep) → słowa kluczowe i modele w tytule (np. Transit, Sprinter, Master, Ducato →
dostawcze; Actros, TGX, ciągnik siodłowy → ciężarowe). Pojazdy N1 oznaczone przez portal jako
„ciężarowe” (np. Opel Combo Cargo) trafiają do dostawczych.

Jeśli któryś portal chwilowo nie działa, jego poprzednie oferty są zachowywane do 3 dni
(oznaczone w panelu statusu), żeby strona nie traciła danych przez jednorazowy błąd.

### Dodanie nowego portalu

Skopiuj `scraper/sources/_template.mjs` do nowego pliku (np. `scraper/sources/nowyportal.mjs`), ustaw
`id`, `name`, `url` i zaimplementuj `scrape()` zwracające listę obiektów (opis pól jest w szablonie).
Runner wczyta moduł automatycznie.

### Gdy portal zmieni wygląd

Scrapery opierają się na strukturze stron / API portali, która może się zmienić. W takiej sytuacji
w `site/data/sources.json` pojawi się błąd lub `count: 0` – wystarczy poprawić odpowiedni plik w
`scraper/sources/`.

## Zastrzeżenia

Projekt pobiera wyłącznie publicznie dostępne informacje (tytuł, parametry, cena, miniatura, link)
i zawsze kieruje do oryginalnej oferty. Przed publicznym udostępnieniem sprawdź regulaminy portali
i plik `robots.txt`; w razie potrzeby wyłącz wybrany portal, usuwając jego moduł z `scraper/sources/`.
Informacje na stronie mają charakter poglądowy – wiążące są dane w serwisie danego portalu.

## Licencja

MIT
