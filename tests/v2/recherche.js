/* Browsermessung fuer den Raum „Recherche" und die Suche (V2-5, Aufgabe T03).
   Misst je Breite und Theme, was nur die Layout-Engine beantworten kann: Klickziele,
   Ueberlauf, Spuren der Videokarten samt Einzelkarten-Gegenprobe (ADR-713 Punkt 6),
   Fokusfalle in verborgenen Raeumen (inklusive #raum-suche), Sichtbarkeit der Flaechen
   und die Raumwelle im Netzwerk.

   Voraussetzung: der Vorschauserver laeuft (tests/v2/preview.cjs 8744 --steuerbar) und
   tests/v2/messung.js ist geladen.
   Aufruf in der Konsole auf http://127.0.0.1:8744/v2.html:
     <script src="/tests/v2/messung.js">, <script src="/tests/v2/recherche.js"> laden, dann
     await V2RECHERCHE.messen()

   Vom Browser gefahren — die Ergebnisse sind nach ADR-315 als Selbstpruefung zu
   kennzeichnen. Das Skript schreibt nichts, was den Bestand betrifft. */
(function () {
  'use strict';
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);

  /* Fokusfalle: jedes Bedienelement in einem verborgenen Raum darf den Fokus NICHT annehmen.
     Gemessen wird durch den Versuch — nicht durch das Lesen des inert-Attributs. */
  function fokusfalle() {
    const vorher = document.activeElement;
    const out = {};
    document.querySelectorAll('.raum[hidden]').forEach((raum) => {
      const ziele = [...raum.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex]')];
      let angenommen = 0;
      ziele.forEach((el) => { try { el.focus(); if (document.activeElement === el) angenommen++; } catch (e) {} });
      out[raum.id] = { kandidaten: ziele.length, fokussierbar: angenommen, inert: raum.hasAttribute('inert'), ariaHidden: raum.getAttribute('aria-hidden') };
    });
    if (vorher && vorher.focus) vorher.focus({ preventScroll: true });
    return out;
  }

  async function messen() {
    const M = window.V2MESSUNG;
    if (!M) return { fehler: 'messung.js nicht geladen' };
    /* Raum sichtbar, erste Karte und ein Archivtag aufgeklappt — so zaehlen alle Klickziele. */
    window.raumZeigen('recherche', false);
    if (typeof window.rcVideosLaden === 'function') await window.rcVideosLaden();
    await warte(300);
    const karte = document.querySelector('#rcListeInhalt article.card details');
    if (karte) karte.open = true;
    const archiv = $('rcArchivListe');
    if (archiv) archiv.open = true;
    const tag = document.querySelector('#rcArchivListe [data-rctag]');
    if (tag && typeof window.rcTagLaden === 'function') { await window.rcTagLaden(tag.dataset.rctag); await warte(300); }
    await warte(200);
    const ziele = M.touchziele();
    const spuren = M.spuren('#rcListeInhalt .jz-grid');
    const einzel = await M.einzelkarte('#rcListeInhalt .jz-grid');
    const kontext = $('rcKontext');
    const cs = getComputedStyle(kontext);
    const netz = performance.getEntriesByType('resource').map((e) => e.name);
    const res = {
      breite: window.innerWidth,
      theme: document.documentElement.dataset.theme || 'auto',
      dunkel: matchMedia('(prefers-color-scheme: dark)').matches,
      flaechen: ['rcSuche', 'rcHaeufig', 'rcListe', 'rcArchiv'].filter((id) => $(id) && !$(id).hidden),
      karten: document.querySelectorAll('#rcListeInhalt article.card').length,
      archivKarten: document.querySelectorAll('#rcArchivTag article.card').length,
      kontext: { position: cs.position, display: cs.display, gridColumn: cs.gridColumn, breite: Math.round(kontext.getBoundingClientRect().width) },
      listeBreite: Math.round($('rcListe').getBoundingClientRect().width),
      suchknopfSichtbar: getComputedStyle(document.querySelector('.rc-suchknopf')).display !== 'none',
      kopffeldSichtbar: getComputedStyle(document.querySelector('.dsearch')).display !== 'none',
      klickzieleGesamt: [...document.querySelectorAll('button,a[href],input,select,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null).length,
      klickzieleUnter44: ziele,
      ueberlauf: M.ueberlauf(),
      spuren: { spuren: spuren.spuren, kinder: spuren.kinder, kindBreite: spuren.kindBreite, containerBreite: spuren.containerBreite, unterObergrenze: spuren.unterObergrenze },
      einzelkarte: { breite: einzel.breiteEinzelkarte, container: einzel.containerBreite, unterObergrenze: einzel.bleibtUnterObergrenze },
      imgImRaum: document.querySelectorAll('#raum-recherche img').length,
      ytimgImNetz: netz.filter((n) => /ytimg/.test(n)).length,
      videosAbrufe: netz.filter((n) => /\/data\/videos\.json/.test(n)).length,
      eigenInKarten: document.querySelectorAll('#rcListeInhalt .mw-eigen, #rcArchivTag .mw-eigen').length,
      fokusfalle: fokusfalle()
    };
    /* Suche-Raum: Fokusfalle auch dort messen, wenn er verborgen ist (er ist es hier). */
    return res;
  }

  window.V2RECHERCHE = { messen, fokusfalle };
  return 'V2RECHERCHE bereit';
})();
