/* Ladewellen-Beleg nach ADR-714 (Auftrag V2-4 Teil E.3).
   Belegt drei Dinge, die der Quelltext allein nicht belegt:
     1. die NETZWERKREIHENFOLGE — radar.json startet vor quotes.json und ist vor ihr fertig;
     2. die SPRUNGFREIHEIT im Radar — mit kuenstlich verzoegertem quotes.json verschiebt der
        Nachzug die Referenzsektion „Termine" um 0 px;
     3. die SPRUNGFREIHEIT in „Meine Werte" — die Reihenfolge der Positionskarten bleibt
        eingefroren, solange der Raum sichtbar ist (ADR-714 Punkt 3).

   Voraussetzung: der Vorschauserver laeuft mit dem steuerbaren Stoermodus.
     node tests/v2/preview.cjs 8744 --steuerbar
   Aufruf in der Konsole auf http://127.0.0.1:8744/v2.html:
     <script src="/tests/v2/ladewellen.js"> laden, dann
     await V2WELLEN.reihenfolge()   — Netzwerkreihenfolge der Feeds
     await V2WELLEN.radarSprung()   — Referenzposition vorher/nachher
     await V2WELLEN.werteSprung()   — Kartenreihenfolge vorher/nachher
     await V2WELLEN.alles()

   Jeder Fall laeuft in einem eigenen iframe derselben Herkunft; die Seite unter Test wird
   nicht veraendert. Vom Browser gefahren — die Ergebnisse sind nach ADR-315 als
   Selbstpruefung zu kennzeichnen. */
(function () {
  'use strict';

  const VERZOEGERUNG = 4000;   // der Stoermodus „langsam" im Vorschauserver

  async function stoere(datei, art) {
    await fetch('/__stoere?reset=1');
    if (datei) await fetch('/__stoere?' + encodeURIComponent(datei) + '=' + encodeURIComponent(art));
  }

  function rahmen() {
    return new Promise((res) => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:900px;border:0';
      f.src = '/v2.html?wellen=' + Date.now();
      f.onload = () => res(f);
      document.body.appendChild(f);
    });
  }
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Ob ein Feed angekommen ist, wird am Netzwerkeintrag abgelesen, NICHT an einer
     Variablen des Fensters: v2.html deklariert QUOTES mit let in einem klassischen
     Script — solche Bindungen haengen nicht am window-Objekt. */
  function feedAngekommen(w, datei) {
    return w.performance.getEntriesByType('resource')
      .some((e) => e.name.indexOf('/data/' + datei) > -1 && e.responseEnd > 0);
  }

  /* Position einer Sektion IM DOKUMENT (nicht im Viewport): der Vergleich soll nicht an
     einer zwischenzeitlichen Scrollbewegung haengen. */
  function oben(doc, id) {
    const el = doc.getElementById(id);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return Math.round(r.top + (doc.defaultView.scrollY || 0));
  }

  /* Raum sichtbar schalten wie ein Nutzerklick — ueber die Funktion der Seite selbst,
     damit inert/aria-hidden und Fokus so gesetzt werden wie im Betrieb. */
  function raum(w, id) { if (typeof w.raumZeigen === 'function') w.raumZeigen(id); }

  /* --- 1. Netzwerkreihenfolge ------------------------------------------------- */
  async function reihenfolge() {
    await stoere(null, null);
    const f = await rahmen();
    await warte(2500);
    const w = f.contentWindow;
    const eintraege = w.performance.getEntriesByType('resource')
      .filter((e) => /\/data\/[a-z-]+\.json/.test(e.name))
      .map((e) => ({
        datei: e.name.split('/').pop(),
        start: Math.round(e.startTime),
        ende: Math.round(e.responseEnd)
      }))
      .sort((a, b) => a.start - b.start);
    f.remove();
    const hol = (n) => eintraege.find((e) => e.datei === n) || null;
    const r = hol('radar.json'), q = hol('quotes.json'), t = hol('ticker-index.json');
    return {
      eintraege,
      radarVorQuotes: !!(r && q) && r.start <= q.start && r.ende < q.ende,
      radarVorTickerIndex: !!(r && t) && r.start <= t.start && r.ende < t.ende,
      radar: r, quotes: q, tickerIndex: t
    };
  }

  /* --- 2. Sprungfreiheit im Radar --------------------------------------------- */
  /* Der Regelfall stoert quotes.json (zweite Welle). Fuer den negativen Gegenfall nach
     ADR-317.5 wird stattdessen radar.json gestoert: dann trifft die OBERSTE Flaeche des
     Raums verspaetet ein, und die Messung MUSS eine Verschiebung ungleich 0 melden. Meldet
     sie auch dort 0, misst sie nichts.
       await V2WELLEN.radarSprung()                      — Regelfall, Erwartung 0 px
       await V2WELLEN.radarSprung({stoere:'radar.json'}) — Gegenprobe, Erwartung ungleich 0 */
  async function radarSprung(opt) {
    const o = opt || {};
    await stoere(o.stoere || 'quotes.json', 'langsam');
    const f = await rahmen();
    const w = f.contentWindow, d = f.contentDocument;
    raum(w, 'radar');
    await warte(1500);                                   // radar/earnings/candidates sind da
    const vorher = {
      termine: oben(d, 'rdTermine'),
      kandidaten: oben(d, 'rdKandidaten'),
      knoepfe: d.querySelectorAll('[data-rdchart]').length,
      gesperrt: d.querySelectorAll('[data-rdchart][disabled]').length,
      signalkarten: d.querySelectorAll('#rdSignaleInhalt article.card').length
    };
    await warte(VERZOEGERUNG + 1500);                    // quotes.json trifft ein
    const nachher = {
      termine: oben(d, 'rdTermine'),
      kandidaten: oben(d, 'rdKandidaten'),
      knoepfe: d.querySelectorAll('[data-rdchart]').length,
      gesperrt: d.querySelectorAll('[data-rdchart][disabled]').length,
      signalkarten: d.querySelectorAll('#rdSignaleInhalt article.card').length
    };
    const quotesDa = feedAngekommen(w, 'quotes.json');
    f.remove();
    await stoere(null, null);
    return {
      vorher, nachher, quotesDa,
      verschiebungTermine: (vorher.termine == null || nachher.termine == null) ? null : nachher.termine - vorher.termine,
      verschiebungKandidaten: (vorher.kandidaten == null || nachher.kandidaten == null) ? null : nachher.kandidaten - vorher.kandidaten,
      knopfzahlKonstant: vorher.knoepfe === nachher.knoepfe
    };
  }

  /* --- 3. Sprungfreiheit in „Meine Werte" (ADR-714 Punkt 3) -------------------- */
  /* Der Bestand des Testgeraets ist in aller Regel leer. Gesetzt wird deshalb ein
     Bestand, dessen Reihenfolge sich OHNE Einfrieren nachweislich aendern wuerde:
     ein Symbol mit Radar-Eintrag steht darin hinter einem ohne. */
  async function werteSprung(symbole) {
    const liste = symbole || ['AAPL', 'LAC', 'SAP.DE'];
    await stoere('quotes.json', 'langsam');
    const f = await rahmen();
    const w = f.contentWindow, d = f.contentDocument;
    /* Bestand im iframe setzen und die Seite ihre eigene Verwaltung benutzen lassen. */
    w.localStorage.setItem('aa-bestand', JSON.stringify({
      schema: 1,
      positionen: liste.map((s, i) => ({ id: 'p' + (i + 1), symbol: s, typ: 'beobachtung', added_at: '2026-09-10' }))
    }));
    w.localStorage.setItem('aa-bestand-mig', '1');
    f.remove();
    /* Zweiter Lauf: derselbe Origin, jetzt mit gesetztem Bestand. */
    const g = await rahmen();
    const gw = g.contentWindow, gd = g.contentDocument;
    raum(gw, 'werte');
    await warte(1500);
    const folge = (doc) => [].slice.call(doc.querySelectorAll('#mwListeInhalt [data-mwsym]'))
      .map((el) => el.getAttribute('data-mwsym'));
    const vorher = { reihenfolge: folge(gd), karten: folge(gd).length, oben: oben(gd, 'mwVerwaltung') };
    await warte(VERZOEGERUNG + 1500);
    const nachher = { reihenfolge: folge(gd), karten: folge(gd).length, oben: oben(gd, 'mwVerwaltung') };
    const quotesDa = feedAngekommen(gw, 'quotes.json');
    g.remove();
    await stoere(null, null);
    return {
      vorher, nachher, quotesDa,
      reihenfolgeGleich: JSON.stringify(vorher.reihenfolge) === JSON.stringify(nachher.reihenfolge),
      verwaltungVerschoben: (vorher.oben == null || nachher.oben == null) ? null : nachher.oben - vorher.oben
    };
  }

  async function alles() {
    return {
      reihenfolge: await reihenfolge(),
      radarSprung: await radarSprung(),
      werteSprung: await werteSprung()
    };
  }

  window.V2WELLEN = { reihenfolge, radarSprung, werteSprung, alles };
  return 'V2WELLEN bereit';
})();
