/**
 * "Add to calendar" for auctions: links for Google / Yahoo / Outlook.com and an .ics file
 * (Apple Calendar, Outlook desktop, Thunderbird, ...). The event covers the last minutes of the
 * auction, so the calendar's default notification fires before bidding closes; the .ics file
 * additionally carries explicit alarms.
 */

const EVENT_MINUTES = 15;
// Alarms relative to the auction end.
const ICS_ALARMS_MIN = [60, 15];

const fmtPrice = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
const fmtDate = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });

/** 2026-11-12T14:00:00.000Z -> 20261112T140000Z */
const utcStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function hasCalendar(v) {
  return Boolean(v._end && v._end > Date.now());
}

function eventData(v) {
  const end = new Date(v._end);
  const start = new Date(v._end - EVENT_MINUTES * 60000);
  const price = v.price ? `${v.priceLabel || 'Cena'}: ${fmtPrice.format(v.price)}${v.priceGross === false ? ' netto' : v.priceGross ? ' brutto' : ''}` : null;
  const details = [
    `Koniec licytacji: ${fmtDate.format(end)}`,
    [v.year, v.mileageKm != null ? `${v.mileageKm.toLocaleString('pl-PL')} km` : null, v.fuel].filter(Boolean).join(' · ') || null,
    price,
    `Portal: ${v.sourceName}`,
    `Oferta: ${v.url}`,
    'Sprawdź aktualną cenę i warunki na stronie aukcji.',
  ].filter(Boolean);
  // Intl uses (narrow) no-break spaces as thousand separators; some calendar apps render them as junk.
  const plain = (s) => s.replace(/[\u00a0\u202f]/g, ' ');
  return { title: plain(`Koniec licytacji: ${v.title}`), start, end, details: plain(details.join('\n')), location: v.location || v.sourceName };
}

export function calendarLinks(v) {
  const e = eventData(v);
  const google = new URL('https://calendar.google.com/calendar/render');
  google.search = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utcStamp(e.start)}/${utcStamp(e.end)}`,
    details: e.details,
    location: e.location,
  });
  const yahoo = new URL('https://calendar.yahoo.com/');
  yahoo.search = new URLSearchParams({
    v: '60',
    title: e.title,
    st: utcStamp(e.start),
    et: utcStamp(e.end),
    desc: e.details,
    in_loc: e.location,
  });
  const outlook = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
  outlook.search = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: e.start.toISOString(),
    enddt: e.end.toISOString(),
    body: e.details,
    location: e.location,
  });
  return { google: google.toString(), yahoo: yahoo.toString(), outlook: outlook.toString(), start: e.start };
}

const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 line folding: max 75 octets per line, continuation lines start with a space. */
function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(list) {
  const now = utcStamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aukcje Poleasingowe//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const v of list.filter(hasCalendar)) {
    const e = eventData(v);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsEscape(v.id)}@aukcje-poleasingowe`,
      `DTSTAMP:${now}`,
      `DTSTART:${utcStamp(e.start)}`,
      `DTEND:${utcStamp(e.end)}`,
      `SUMMARY:${icsEscape(e.title)}`,
      `DESCRIPTION:${icsEscape(e.details)}`,
      `LOCATION:${icsEscape(e.location)}`,
      `URL:${icsEscape(v.url)}`,
    );
    for (const min of ICS_ALARMS_MIN) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`Za ${min} min koniec licytacji: ${v.title}`)}`, `TRIGGER:-PT${Math.max(0, min - EVENT_MINUTES)}M`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadIcs(list, filename) {
  const blob = new Blob([buildIcs(list)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/gi, 'l')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60);

/* ---------- Popup menu (one shared instance) ---------- */

let menu;
let anchor;

function closeMenu(restoreFocus = true) {
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  anchor?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) anchor?.focus({ preventScroll: true });
  anchor = null;
}

function ensureMenu() {
  if (menu) return menu;
  menu = document.createElement('div');
  menu.className = 'cal-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  menu.innerHTML = `
    <p class="cal-menu__head">Przypomnij o końcu licytacji</p>
    <a role="menuitem" data-cal="google" target="_blank" rel="noopener">Google Kalendarz</a>
    <a role="menuitem" data-cal="yahoo" target="_blank" rel="noopener">Yahoo Kalendarz</a>
    <a role="menuitem" data-cal="outlook" target="_blank" rel="noopener">Outlook.com</a>
    <button type="button" role="menuitem" data-cal="ics">Apple / Outlook / inne (plik .ics)</button>
    <p class="cal-menu__hint"></p>`;
  document.body.append(menu);
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-cal]');
    if (!item) return;
    if (item.dataset.cal === 'ics') downloadIcs([menu._vehicle], `licytacja-${slug(menu._vehicle.title)}.ics`);
    setTimeout(closeMenu, 0);
  });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('[role=menuitem]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    } else if (e.key === 'Escape') closeMenu();
    else if (e.key === 'Tab') closeMenu(false);
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !anchor?.contains(e.target)) closeMenu(false);
  });
  window.addEventListener('resize', () => closeMenu(false));
  return menu;
}

export function openCalendarMenu(button, v) {
  const m = ensureMenu();
  if (!m.hidden && anchor === button) return closeMenu();
  closeMenu();
  const links = calendarLinks(v);
  m._vehicle = v;
  for (const key of ['google', 'yahoo', 'outlook']) m.querySelector(`[data-cal=${key}]`).href = links[key];
  m.querySelector('.cal-menu__hint').textContent =
    `Wydarzenie: ${fmtDate.format(links.start)} – koniec aukcji ${new Date(v._end).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;

  m.hidden = false;
  anchor = button;
  button.setAttribute('aria-expanded', 'true');
  const r = button.getBoundingClientRect();
  const w = m.offsetWidth;
  const left = Math.min(Math.max(8, r.right - w), document.documentElement.clientWidth - w - 8);
  const below = r.bottom + m.offsetHeight + 8 < window.innerHeight;
  m.style.left = `${left + window.scrollX}px`;
  m.style.top = `${(below ? r.bottom + 6 : r.top - m.offsetHeight - 6) + window.scrollY}px`;
  m.querySelector('[role=menuitem]').focus({ preventScroll: true });
}
