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

  async function stoere(datei, art) {
    await fetch('/__stoere?reset=1');
    if (datei) await fetch('/__stoere?' + encodeURIComponent(datei) + '=' + encodeURIComponent(art));
  }

  function ladeRahmen(wartezeit) {
    return new Promise((res) => {
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
    let ausnahme = null;
    try { w.jetztRendern(); } catch (e) { ausnahme = String(e && e.message || e); }
    const bedienbar = [...d.querySelectorAll('button,a[href]')].filter(e => e.offsetParent !== null).length;
    return {
      sichtbareFlaechen: sichtbar,
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
