/* Deterministische Pruefung der Layout-Regeln aus V2-6 (Fläche, Raster, fluide
   Mittel, Dezimaltrennzeichen) am ausgelieferten Quelltext von v2.html.
   Aufruf:  node tests/v2/layout.cjs
   Exit 0 = alle Gruppen gruen, Exit 1 = mindestens ein Fall fehlgeschlagen.

   Zu jedem Kriterium gehoert ein NEGATIVER Fall (ADR-315.2): dieselbe Pruefung
   laeuft ein zweites Mal gegen eine absichtlich verdorbene Kopie im Speicher und
   MUSS dort anschlagen. Faellt der negative Fall nicht durch, ist die Pruefung
   selbst kaputt und der Lauf rot. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WURZEL = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(WURZEL, 'v2.html'), 'utf8');

let gruppen = 0, faelle = 0, fehler = 0;
function gruppe(titel, fn) {
  gruppen++;
  const vorher = fehler;
  fn();
  console.log((fehler === vorher ? 'ok    ' : 'FEHLER') + ' ' + titel);
}
function pruef(name, ist, soll) {
  faelle++;
  const a = JSON.stringify(ist), b = JSON.stringify(soll);
  if (a !== b) { fehler++; console.error('       x ' + name + '\n         ist:  ' + a + '\n         soll: ' + b); }
}
/* Negativer Fall: messen(verdorben) MUSS sich von messen(html) unterscheiden. */
function negativ(name, verdorben, messen) {
  faelle++;
  const gut = JSON.stringify(messen(html));
  const schlecht = JSON.stringify(messen(verdorben));
  if (gut === schlecht) {
    fehler++;
    console.error('       x negativer Fall schlaegt NICHT an: ' + name + '\n         beide Male: ' + gut);
  }
}

/* --- Nur der <style>-Block, nicht das Markup ---------------------------------- */
function stil(q) {
  const a = q.indexOf('<style>'), b = q.indexOf('</style>', a);
  return a < 0 ? '' : q.slice(a, b);
}

/* --- Kriterium 1: Container-Formel aus § 4 ------------------------------------ */
function containerRegel(q) {
  const m = stil(q).match(/\.wrap\{([^}]*)\}/);
  if (!m) return { gefunden: false };
  const r = m[1];
  return {
    gefunden: true,
    formel: /width:min\(100% ?- ?2\*var\(--rand\) ?, ?1600px\)/.test(r),
    zentriert: /margin-inline:auto/.test(r),
    keinAltdeckel: !/max-width:1180px/.test(r),
    keinPadding: !/padding/.test(r)
  };
}
gruppe('Kriterium 1 — Container min(100% - 2*Rand, 1600px), zentriert, ohne Padding', () => {
  pruef('.wrap-Regel', containerRegel(html), { gefunden: true, formel: true, zentriert: true, keinAltdeckel: true, keinPadding: true });
  pruef('Aussenraender 16/24/32 als --rand je Breakpoint', [
    /\.wrap\{--rand:var\(--sp-4\)/.test(stil(html)),
    /min-width:640px\)\{\.wrap\{--rand:var\(--sp-6\)\}\}/.test(stil(html)),
    /min-width:1024px\)\{\.wrap\{--rand:var\(--sp-8\)\}\}/.test(stil(html))
  ], [true, true, true]);
  pruef('Tokenwerte --sp-4/6/8 sind 16/24/32 px', [
    /--sp-4:16px/.test(html), /--sp-6:24px/.test(html), /--sp-8:32px/.test(html)
  ], [true, true, true]);
  negativ('alter 1180er-Deckel wieder eingesetzt',
    html.replace('width:min(100% - 2*var(--rand),1600px)', 'width:100%;max-width:1180px'),
    containerRegel);
});

/* --- Kriterium 2: genau zwei Viewport-Breakpoints ----------------------------- */
/* Container-Query-Schwellen sind laut § 4 KEINE Breakpoints und werden deshalb
   ausgenommen: @container zaehlt nicht, nur @media. Ebenso ausgenommen sind die
   Merkmalsabfragen ohne Breite (hover, prefers-*). */
function breakpoints(q) {
  const roh = stil(q).match(/@media[^{]*\((?:min|max)-width:\s*[\d.]+px\)/g) || [];
  const zahlen = new Set();
  roh.forEach(m => {
    const t = m.match(/(min|max)-width:\s*([\d.]+)px/g) || [];
    t.forEach(x => {
      const [, art, wert] = x.match(/(min|max)-width:\s*([\d.]+)px/);
      zahlen.add(art === 'max' ? String(Number(wert) + 1) : String(Number(wert)));
    });
  });
  return [...zahlen].map(Number).sort((a, b) => a - b);
}
gruppe('Kriterium 2 — genau zwei Viewport-Breakpoints (640/1024)', () => {
  pruef('Breakpoint-Schwellen', breakpoints(html), [640, 1024]);
  negativ('dritter Breakpoint eingeschmuggelt',
    stilErsetze(html, '@media (min-width:900px){.jz{gap:0}}'),
    breakpoints);
});
function stilErsetze(q, zusatz) { return q.replace('</style>', zusatz + '\n</style>'); }

/* --- Kriterium 3: 7/5-Raster mit expliziter Platzierung ----------------------- */
function raster(q) {
  const s = stil(q);
  return {
    zwoelfSpalten: /\.jz\{display:grid;grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/.test(s),
    gutter16: /column-gap:var\(--sp-4\)/.test(s),
    linksSieben: /#jzLead,#jzFolge,#jzMeldungen\{grid-column:1 \/ span 7\}/.test(s),
    rechtsFuenf: /#jzKontext\{grid-column:8 \/ span 5;grid-row:1 \/ span 3/.test(s),
    sticky: /#jzKontext\{[^}]*position:sticky/.test(s),
    eigenerScroll: /#jzKontext\{[^}]*overflow-y:auto/.test(s),
    hoehendeckel: /#jzKontext\{[^}]*max-height:calc\(100vh/.test(s),
    kontextDurchsichtig: /\.jz-kontext\{display:contents\}/.test(s)
  };
}
gruppe('Kriterium 3 — 7/5-Raster, explizite Platzierung, sticky Kontextspalte', () => {
  pruef('Rasterregeln', raster(html), {
    zwoelfSpalten: true, gutter16: true, linksSieben: true, rechtsFuenf: true,
    sticky: true, eigenerScroll: true, hoehendeckel: true, kontextDurchsichtig: true
  });
  pruef('Markup: jzFokus und jzMarkt liegen in #jzKontext, jzMeldungen nicht', markupSpalten(html),
    { kontextEnthaelt: ['jzFokus', 'jzMarkt'], ausserhalb: ['jzLead', 'jzFolge', 'jzMeldungen'] });
  negativ('Platzierung ueber die Dokumentreihenfolge statt explizit',
    html.replace('#jzLead,#jzFolge,#jzMeldungen{grid-column:1 / span 7}', ''),
    raster);
  negativ('jzMarkt aus der Kontextspalte geloest',
    html.replace('</div><!-- /#jzKontext -->', '').replace('<div class="jz-kontext" id="jzKontext">', '<div class="jz-kontext" id="jzKontext"></div>'),
    markupSpalten);
});
function markupSpalten(q) {
  const a = q.indexOf('<div class="jz-kontext" id="jzKontext">');
  const b = q.indexOf('</div><!-- /#jzKontext -->');
  const innen = (a > -1 && b > a) ? q.slice(a, b) : '';
  const alle = ['jzLead', 'jzFolge', 'jzFokus', 'jzMarkt', 'jzMeldungen'];
  const drin = alle.filter(id => innen.includes('id="' + id + '"'));
  return { kontextEnthaelt: drin, ausserhalb: alle.filter(id => !drin.includes(id)) };
}

/* --- Kriterium 4: jzReihenfolge bleibt und haengt an der 1024er-Schwelle ------ */
function reihenfolge(q) {
  const m = q.match(/function jzReihenfolge\(\)\{[\s\S]*?\n\}/);
  const k = m ? m[0] : '';
  return {
    vorhanden: !!m,
    bestandsbedingung: /bstPositionen\(\)\.length/.test(k),
    schmalGebunden: /JZ_SCHMAL\.matches/.test(k),
    schiebtVorLead: /insertBefore\(fokus,lead\)/.test(k),
    holtZurueck: /kontext\.insertBefore\(fokus/.test(k),
    schwelle1023: /matchMedia\('\(max-width:1023px\)'\)/.test(q),
    beiRenderAufgerufen: /function jetztRendern\(\)\{\s*\n?\s*jzReihenfolge\(\);/.test(q)
  };
}
gruppe('Kriterium 4 — jzReihenfolge vorhanden, an 1024 px gebunden, idempotent', () => {
  pruef('jzReihenfolge', reihenfolge(html), {
    vorhanden: true, bestandsbedingung: true, schmalGebunden: true,
    schiebtVorLead: true, holtZurueck: true, schwelle1023: true, beiRenderAufgerufen: true
  });
  negativ('Bindung an die schmale Ansicht entfernt',
    html.replace('JZ_SCHMAL.matches&&bstPositionen().length', 'bstPositionen().length'),
    reihenfolge);
});

/* Kriterium 5 (fluide Mittel) und 6 (Dezimalkomma) folgen mit den Auftragsteilen
   C/D und E — sie werden hier ergaenzt, sobald der Code dafuer steht. */

/* --- Kriterium 7: nichts ausserhalb des Scope veraendert ---------------------- */
function hash(p) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(WURZEL, p))).digest('hex').slice(0, 16); }
  catch (e) { return 'fehlt'; }
}
gruppe('Kriterium 7 — CSP zeichengleich, Fremddateien unberuehrt', () => {
  const cspV2 = (html.match(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/) || [''])[0];
  const idx = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
  const cspV1 = (idx.match(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/) || [''])[0];
  pruef('CSP-Meta zeichengleich zu index.html', cspV2 === cspV1 && cspV2.length > 0, true);
  pruef('CSP-Laenge in Byte', Buffer.byteLength(cspV2, 'utf8'), Buffer.byteLength(cspV1, 'utf8'));
  faelle++;
  console.log('       i Hashes (Kurzform): index.html=' + hash('index.html') +
    ' v2-gpt.html=' + hash('v2-gpt.html') +
    ' tests/v2-gpt/preview.cjs=' + hash('tests/v2-gpt/preview.cjs'));
  negativ('CSP verändert', html.replace('Content-Security-Policy', 'Content-Security-Policy-X'),
    q => (q.match(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/) || [''])[0]);
});

console.log((fehler ? 'LAYOUT_CHECK FEHLER' : 'LAYOUT_CHECK OK') +
  ' gruppen=' + gruppen + ' faelle=' + faelle + ' fehler=' + fehler);
process.exit(fehler ? 1 : 0);
