/* Ausfallmatrix fuer den Raum „Jetzt" (V2-6 Teil F.1).
   Faehrt jeden von „Jetzt" gelesenen Feed einzeln mit 404, ungueltigem JSON,
   strukturell falschem Inhalt und langsamer Antwort und protokolliert je Fall,
   was uebrig bleibt.

   Voraussetzung: der Vorschauserver laeuft mit dem steuerbaren Stoermodus.
     node tests/v2/preview.cjs 8744 --steuerbar
   Aufruf in der Konsole auf http://127.0.0.1:8744/v2.html:
     <script src="/tests/v2/ausfallmatrix.js"> laden, dann
     await V2AUSFALL.lauf()                      — alle Faelle
     await V2AUSFALL.lauf({von:0, bis:12})       — in Haeppchen, gegen Timeouts

   Jeder Fall laeuft in einem eigenen iframe derselben Herkunft; die Seite unter
   Test wird nicht veraendert. Geprueft wird das Ergebnis (welche Flaechen bleiben,
   bleibt die Seite bedienbar) UND das Verhalten: jetztRendern() wird im iframe ein
   zweites Mal aufgerufen und eine Ausnahme im Elternfenster gefangen.

   Reproduzierbares Werkzeug, aber vom Browser gefahren — Ergebnisse sind als
   Selbstpruefung zu kennzeichnen (ADR-315). */
(function () {
  'use strict';

  /* Die zwoelf Dateien, die v2.html beim Start liest. Der Tagesdigest heisst nach
     dem Datum und wird zur Laufzeit aus index.json bestimmt. */
  const FEEDS = ['index.json', 'market.json', 'quotes.json', 'radar.json', 'ticker-index.json',
    'videos.json', 'videos-index.json', 'earnings.json', 'earnings-recap.json',
    'candidates.json', 'ideas.json'];
  const ARTEN = ['404', 'muell', 'struktur'];
  const SEKTIONEN = ['jzLead', 'jzFolge', 'jzFokus', 'jzMarkt', 'jzMeldungen'];
  /* V2-3: die drei Flaechen des Raums „Radar" */
  const RD_SEKTIONEN = ['rdSignale', 'rdTermine', 'rdKandidaten'];
  /* V2-4: die drei Bereiche des Raums Meine Werte. Er liest quotes.json und
     ticker-index.json fuer die Karteninhalte sowie earnings.json, radar.json und
     candidates.json fuer einzelne Zeilen darin. Erwartung: es entfaellt genau die
     betroffene ZEILE, nie die Karte und nie der Raum. */
  const MW_SEKTIONEN = ['mwListe', 'mwVerwaltung', 'mwCode'];
  const MW_TESTBESTAND = { schema: 1, positionen: [
    { id: 'p1', symbol: 'META', typ: 'aktie', stueck: 25, einstand: 118.4, waehrung: 'USD', added_at: '2026-09-10' },
    { id: 'p2', symbol: 'SAP.DE', typ: 'beobachtung', added_at: '2026-09-10' },
    { id: 'p3', symbol: 'AMD', typ: 'derivat', added_at: '2026-09-10',
      derivat: { art: 'knockout', richtung: 'long', hebel: 8.5, ko_schwelle: 120 } },
    /* ORCL traegt am 10.09.2026 einen Termin im Fenster — ohne einen solchen Wert
       bliebe der earnings-Ausfall wirkungslos und damit ungeprueft (ADR-317.5). */
    { id: 'p4', symbol: 'ORCL', typ: 'aktie', added_at: '2026-09-10' }] };

  async function stoere(datei, art) {
    await fetch('/__stoere?reset=1');
    if (datei) await fetch('/__stoere?' + encodeURIComponent(datei) + '=' + encodeURIComponent(art));
  }

  function ladeRahmen(wartezeit) {
    return new Promise((res) => {
      /* Der Bestand muss VOR dem Laden im localStorage derselben Herkunft stehen —
         sonst prueft die Matrix den Leerzustand statt der Karten (V2-4). */
      try { localStorage.setItem('aa-bestand', JSON.stringify(MW_TESTBESTAND));
        localStorage.setItem('aa-bestand-mig', '1'); } catch (e) {}
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1280px;height:900px;border:0';
      f.src = '/v2.html?matrix=' + Date.now();
      f.onload = () => setTimeout(() => res(f), wartezeit || 1400);
      document.body.appendChild(f);
    });
  }

  function befund(f) {
    const d = f.contentDocument, w = f.contentWindow;
    const sichtbar = SEKTIONEN.filter(id => { const e = d.getElementById(id); return e && !e.hidden; });
    /* V2-3: dieselbe Prüfung für den Raum „Radar". Erst jetzt hat sie Aussagekraft —
       vorher trug keiner der drei Feeds dort sichtbare Fläche (Befund 4 aus
       AA-20260906-FE-01-E01). Ein Ladezustand zählt NICHT als Fläche: sonst
       meldete ein Ausfall dasselbe wie ein erfolgreicher Lauf. */
    const rdSichtbar = RD_SEKTIONEN.filter(id => {
      const e = d.getElementById(id);
      if (!e || e.hidden) return false;
      return !/werden geladen\./.test(e.textContent || '');
    });
    /* V2-4: der Raum muss sichtbar geschaltet werden, sonst rendert er nicht. */
    try { w.raumZeigen('werte', false); } catch (e) {}
    const mwSichtbar = MW_SEKTIONEN.filter(id => { const e = d.getElementById(id); return e && !e.hidden; });
    const mwKarten = d.querySelectorAll('#mwListeInhalt [data-mwsym]').length;
    const mwZeilen = {
      /* Der Kursblock steht nach ADR-714 Punkt 2 IMMER; gezaehlt wird deshalb nur, was
         wirklich eine Zahl traegt — sonst meldete ein Ausfall dasselbe wie ein Treffer. */
      kursMitWert: [].slice.call(d.querySelectorAll('#mwListeInhalt .mw-kurs'))
        .filter(e => /[0-9]/.test(e.textContent || '')).length,
      kursblock: d.querySelectorAll('#mwListeInhalt .mw-kurs').length,
      termin: [].slice.call(d.querySelectorAll('#mwListeInhalt .jz-liste span'))
        .filter(e => /^Zahlen am/.test((e.textContent || '').trim())).length,
      derivat: d.querySelectorAll('#mwListeInhalt .mw-derivat').length,
      video: d.querySelectorAll('#mwListeInhalt .mw-video').length,
      trigger: d.querySelectorAll('#mwListeInhalt .rd-trigger').length
    };
    let ausnahme = null;
    try { w.jetztRendern(); w.radarRendern(); w.werteRendern(); } catch (e) { ausnahme = String(e && e.message || e); }
    const bedienbar = [...d.querySelectorAll('button,a[href]')].filter(e => e.offsetParent !== null).length;
    return {
      sichtbareFlaechen: sichtbar,
      radarFlaechen: rdSichtbar,
      radarZeichen: (d.getElementById('rdInhalt') || {}).textContent
        ? d.getElementById('rdInhalt').textContent.trim().length : 0,
      werteFlaechen: mwSichtbar,
      werteKarten: mwKarten,
      werteZeilen: mwZeilen,
      ausnahmeBeimRendern: ausnahme,
      bedienelemente: bedienbar,
      inhaltZeichen: (d.getElementById('jzInhalt') || {}).textContent
        ? d.getElementById('jzInhalt').textContent.trim().length : 0,
      leerhinweise: d.querySelectorAll('.jz-leer,.jz-fehler').length,
      horizontalerUeberlauf: d.documentElement.scrollWidth > d.documentElement.clientWidth
    };
  }

  async function einFall(datei, art, wartezeit) {
    await stoere(datei, art);
    const f = await ladeRahmen(wartezeit);
    let b;
    try { b = befund(f); } catch (e) { b = { fehler: String(e && e.message || e) }; }
    f.remove();
    return Object.assign({ datei: datei || '(ungestoert)', art: art || '-' }, b);
  }

  function faelle() {
    const l = [{ datei: null, art: null }];              // Referenzlauf zuerst
    FEEDS.forEach(d => ARTEN.forEach(a => l.push({ datei: d, art: a })));
    l.push({ datei: 'market.json', art: 'langsam' });     // langsamer Feed
    return l;
  }

  async function lauf(opt) {
    const o = opt || {};
    const alle = faelle();
    const von = o.von || 0, bis = Math.min(o.bis == null ? alle.length : o.bis, alle.length);
    const out = [];
    for (let i = von; i < bis; i++) {
      const f = alle[i];
      out.push(Object.assign({ nr: i }, await einFall(f.datei, f.art, f.art === 'langsam' ? 1200 : (o.wartezeit || 1300))));
    }
    await stoere(null, null);                            // Server sauber hinterlassen
    return { faelleGesamt: alle.length, von, bis, ergebnisse: out };
  }

  window.V2AUSFALL = { lauf, einFall, faelle, FEEDS, ARTEN };
  return 'V2AUSFALL bereit — ' + faelle().length + ' Faelle';
})();
