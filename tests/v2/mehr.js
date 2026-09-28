/* Messskript fuer den Raum „Mehr" und die Fusszeile (V2-7 Teil B).
   Aufruf in der Konsole der laufenden Vorschau (tests/v2/preview.cjs):
     eval(await (await fetch('/tests/v2/mehr.js')).text()); await V2MEHR.alles()
   Versioniert und wiederholbar, das Fahren des Browsers ist es nicht — Ergebnisse sind
   deshalb Selbstpruefung (ADR-315). Das Skript schreibt nichts in den Speicher der Seite. */
(function () {
  'use strict';
  const warte = (ms) => new Promise(r => setTimeout(r, ms));
  const sichtbar = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const ZIEL = 'a[href],button:not(:disabled),input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';

  /* Klickziele unter 44 px im aktiven Raum und in der Fusszeile (Inline-Textlinks in
     Fliesstext zaehlen nach WCAG 2.5.8 nicht als Ziel und werden getrennt ausgewiesen). */
  function klickziele() {
    const raum = document.querySelector('.raum:not([hidden])');
    const alle = [...raum.querySelectorAll(ZIEL), ...document.querySelectorAll('.fuss ' + ZIEL)].filter(sichtbar);
    const klein = [], inline = [];
    alle.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width >= 44 && r.height >= 44) return;
      const imText = el.tagName === 'A' && el.closest('p');
      (imText ? inline : klein).push((el.id || el.textContent.trim().slice(0, 24)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    return { raum: raum.dataset.raum, ziele: alle.length, unter44: klein.length, klein, inlineTextlinks: inline.length };
  }
  /* In jedem verborgenen Raum duerfen 0 Elemente fokussierbar sein (DoD-Basis 5). */
  function fokusfalle() {
    const out = {};
    document.querySelectorAll('.raum[hidden]').forEach(r => {
      out[r.dataset.raum] = [...r.querySelectorAll(ZIEL)].filter(el => !el.closest('[inert]')).length;
    });
    return out;
  }
  function spuren(sel) {
    const el = document.querySelector(sel); if (!el) return null;
    const cols = getComputedStyle(el).gridTemplateColumns.split(' ').filter(c => c && c !== '0px');
    const kinder = [...el.children].map(k => Math.round(k.getBoundingClientRect().width));
    return { spuren: cols.length, spalten: cols.join(' '), kinder: kinder.length, breiteMax: Math.max(...kinder) };
  }
  const ueberlauf = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;

  /* Aus jedem der fuenf Raeume: Klick auf den Fusslink ⇒ Raum „Mehr", Fokus auf der
     Abschnittsueberschrift, Abschnitt sichtbar unter der Kopfleiste. Ein Schritt. */
  async function fussSprung() {
    const out = [];
    for (const raum of ['jetzt', 'radar', 'recherche', 'werte', 'mehr']) {
      for (const ziel of ['mhImpressum', 'mhDatenschutz']) {
        raumZeigen(raum, false); await warte(60);
        const link = document.querySelector('.fuss [data-mhziel="' + ziel + '"]');
        const r0 = link.getBoundingClientRect();
        link.click(); await warte(1500);
        const h = document.getElementById(ziel + 'H'), r = h.getBoundingClientRect();
        out.push({ von: raum, ziel, linkText: link.textContent.trim(), linkHoehe: Math.round(r0.height),
          raumDanach: RAUM_AKTIV, fokus: document.activeElement === h, oben: Math.round(r.top), imBild: r.top >= 0 && r.top < innerHeight });
      }
    }
    return out;
  }
  /* Alle Anfragen seit dem Laden, nach Origin gruppiert. */
  function herkunft() {
    const o = {};
    performance.getEntriesByType('resource').forEach(e => { const u = new URL(e.name); o[u.origin] = (o[u.origin] || 0) + 1; });
    o[location.origin + ' (Dokument)'] = 1;
    return o;
  }
  async function alles() {
    raumZeigen('mehr', false); await warte(100);
    return { fenster: innerWidth, theme: document.documentElement.getAttribute('data-theme') || 'auto', ueberlauf: ueberlauf(),
      klickziele: klickziele(), fokusfalle: fokusfalle(),
      spurenKO: spuren('#mhKO .jz-grid'), spurenTage: spuren('#mhEarnTage') };
  }
  window.V2MEHR = { klickziele, fokusfalle, spuren, ueberlauf, fussSprung, herkunft, alles };
})();
