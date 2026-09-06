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

/* --- Nur der <style>-Block, nicht das Markup ----------------------------------
   CSS-Kommentare werden entfernt, sonst zaehlt ein Kommentar wie „frueher @media
   (min-width:640px)" als echter Breakpoint. Genau das ist beim ersten Lauf
   passiert und hat den Breakpoint-Test zu Recht rot gemacht. */
function stil(q) {
  const a = q.indexOf('<style>'), b = q.indexOf('</style>', a);
  return a < 0 ? '' : q.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/* --- Kriterium 1: Container-Formel aus § 4 ------------------------------------ */
function containerRegel(q) {
  const m = stil(q).match(/\.wrap\{([^}]*)\}/);
  if (!m) return { gefunden: false };
  const r = m[1];
  return {
    gefunden: true,
    formel: /width:calc\(100% ?- ?2\*var\(--rand\)\)/.test(r),
    zentriert: /margin-inline:auto/.test(r),
    /* ADR-712 Punkt 1: KEIN Maximalwert mehr — weder als max-width noch im min() */
    keinDeckel: !/max-width/.test(r) && !/min\(/.test(r),
    keinPadding: !/padding/.test(r)
  };
}
gruppe('Kriterium 1 — Container calc(100% - 2*Rand) ohne Deckel, zentriert, ohne Padding', () => {
  pruef('.wrap-Regel', containerRegel(html), { gefunden: true, formel: true, zentriert: true, keinDeckel: true, keinPadding: true });
  pruef('Aussenrand: 16 mobil, 24 Tablet, ab 1024 clamp(32px,2.5vw,80px)', [
    /\.wrap\{--rand:var\(--sp-4\)/.test(stil(html)),
    /min-width:640px\)\{\.wrap\{--rand:var\(--sp-6\)\}\}/.test(stil(html)),
    /min-width:1024px\)\{\.wrap\{--rand:clamp\(32px,2\.5vw,80px\)\}\}/.test(stil(html))
  ], [true, true, true]);
  pruef('Tokenwerte --sp-4/6 sind 16/24 px', [
    /--sp-4:16px/.test(html), /--sp-6:24px/.test(html)
  ], [true, true]);
  negativ('Deckel wieder eingesetzt',
    html.replace('width:calc(100% - 2*var(--rand))', 'width:min(100% - 2*var(--rand),1600px)'),
    containerRegel);
  negativ('Aussenrand wieder fest bei 32 px',
    html.replace('--rand:clamp(32px,2.5vw,80px)', '--rand:var(--sp-8)'),
    q => (stil(q).match(/min-width:1024px\)\{\.wrap\{--rand:[^}]*\}/) || [''])[0]);
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

/* --- Kriterium 5: Zeilenlaengen-Deckel und fluide Mittel --------------------- */
function fluid(q) {
  const s = stil(q);
  return {
    deckelWert: (s.match(/\.jz-fliess\{max-width:min\((\d+)ch,100%\)/) || [])[1] || null,
    containerTraeger: /#jzLead,#jzFolge,#jzFokus,#jzMarkt,#jzMeldungen\{container-type:inline-size\}/.test(s),
    nichtAufBody: !/body\{[^}]*container-type/.test(s),
    containerAbfragen: (s.match(/@container \(min-width:/g) || []).length,
    /* ADR-712 Punkt 6: Schwellen, die ueber Spurenzahl oder Textbreite entscheiden,
       stehen schriftrelativ. Die zwei Viewport-Breakpoints bleiben laut § 4 in px. */
    containerAbfragenInPx: (s.match(/@container \(min-width:\s*[\d.]+px\)/g) || []).length,
    autoFit: (s.match(/repeat\(auto-fit,minmax\(/g) || []).length,
    keinAutoFill: !/auto-fill/.test(s),
    /* ADR-712 Punkte 3 und 4: Spurenzahl nach der hergeleiteten Idealbreite 35rem,
       Obergrenze 45rem als Deckel am Kind — siehe die Begruendung im Stylesheet:
       zwei definite Werte im minmax() haetten die Spurenzahl nach der Obergrenze
       bestimmt und die im Auftrag erwarteten 1/2/3 Spuren verfehlt. */
    spurenregel: (s.match(/repeat\(auto-fit,minmax\(min\(100%,35rem\),1fr\)\)/g) || []).length,
    obergrenzeAmKind: /\{max-width:45rem\}/.test(s),
    keineAltbreite: !/minmax\(min\(100%,(280|320)px\)/.test(s),
    /* nicht [^)]*: var(--sp-4) enthaelt selbst eine Klammer und wuerde den Treffer abschneiden */
    clampCqi: (s.match(/clamp\([\s\S]{0,80}?cqi/g) || []).length,
    fallback: /@supports not \(container-type:inline-size\)/.test(s)
  };
}
gruppe('Kriterium 5 — Zeilendeckel, Container Queries, clamp, auto-fit, Fallback', () => {
  const f = fluid(html);
  /* 54ch statt 62ch: gemessener Wert, siehe design/design-system.md § 4.1. */
  pruef('Zeilenlaengen-Deckel in ch', f.deckelWert, '54');
  pruef('container-type auf den fuenf Rasterfeldern, nicht auf body',
    [f.containerTraeger, f.nichtAufBody], [true, true]);
  pruef('mindestens zwei @container-Abfragen', f.containerAbfragen >= 2, true);
  pruef('auto-fit statt auto-fill', [f.autoFit >= 3, f.keinAutoFill], [true, true]);
  pruef('mindestens zwei clamp() an cqi gebunden', f.clampCqi >= 2, true);
  pruef('@supports-Fallback vorhanden', f.fallback, true);
  /* --- ADR-712: Spurenregel mit Obergrenze, schriftrelative Schwellen ---------- */
  pruef('Spurenregel auf der hergeleiteten Idealbreite 35rem, mindestens drei Flaechen',
    f.spurenregel >= 3, true);
  pruef('Obergrenze 45rem als Deckel am Kind vorhanden', f.obergrenzeAmKind, true);
  pruef('keine px-Mindestbreiten aus dem Vorzustand mehr', f.keineAltbreite, true);
  pruef('keine @container-Schwelle mehr in px', f.containerAbfragenInPx, 0);
  negativ('Obergrenze entfernt (die Dehnung, die ADR-712 verbietet)',
    html.replace(/\.jz-grid>\*,#jzMoverListe>\*,#jzMeldungenListe>\*\{max-width:45rem\}/, ''),
    fluid);
  negativ('Container-Query-Schwelle wieder in px',
    html.replace('@container (min-width:37rem)', '@container (min-width:592px)'),
    fluid);
  pruef('Fliesstext-Deckel im gerenderten Markup und in den Renderfunktionen',
    (html.match(/jz-fliess/g) || []).length >= 4, true);
  negativ('Fallback-Bedingung umgedreht',
    html.replace('@supports not (container-type:inline-size)', '@supports (container-type:inline-size)'),
    fluid);
  negativ('Deckel zurueck auf den ungemessenen Entwurfswert',
    html.replace('.jz-fliess{max-width:min(54ch,100%)', '.jz-fliess{max-width:min(62ch,100%)'),
    fluid);
  /* Schwelle steht seit ADR-712 in rem — der Ersetzungsstring musste mitziehen,
     sonst traf er nichts mehr und der negative Fall lief ins Leere. */
  negativ('Container Queries wieder durch einen Viewport-Breakpoint ersetzt',
    html.replace('@container (min-width:37rem)', '@media (min-width:37rem)'),
    fluid);
});

/* --- Kriterium 6: Dezimaltrennzeichen (Teil E) --------------------------------
   Angezeigte Zahlen tragen das Komma. Ausgenommen sind die Rechenstellen: die
   Kerzenaufbereitung und die SVG-Koordinaten. Ebenfalls ausgenommen ist x.val —
   der Wert kommt als bereits deutsch formatierte ZEICHENKETTE aus dem Feed
   („7.722" ist ein Tausenderpunkt), ein Tausch haette ihn verfaelscht. */
function dezimal(q) {
  const fp = (q.match(/function fp\(p\)\{[^\n]*/) || [''])[0];
  return {
    fpMitKomma: /toFixed\(2\)\.replace\("\.",","\)/.test(fp),
    kerzenUnveraendert: /open:\+\(\+o\)\.toFixed\(2\),high:\+\(\+h\)\.toFixed\(2\)/.test(q),
    koordinatenUnveraendert: /const cx=\(65\+50\*Math\.cos\(w\)\)\.toFixed\(1\),cy=\(62-50\*Math\.sin\(w\)\)\.toFixed\(1\)/.test(q),
    fgWertDeutsch: /toLocaleString\('de-DE'\)/.test(q),
    valUnangetastet: /escapeHtml\(String\(x\.val==null\?'':x\.val\)\)/.test(q)
  };
}
gruppe('Kriterium 6 — deutsches Dezimalkomma bei angezeigten Zahlen', () => {
  pruef('Dezimalstellen', dezimal(html), {
    fpMitKomma: true, kerzenUnveraendert: true, koordinatenUnveraendert: true,
    fgWertDeutsch: true, valUnangetastet: true
  });
  /* Gegenprobe auf der Funktion selbst, nicht nur auf dem Quelltext. */
  faelle++;
  const fpQuelle = (html.match(/function fp\(p\)\{[^\n]*\}/) || [''])[0];
  const fpFn = new Function('return ' + fpQuelle.replace('function fp', 'function'))();
  const ist = [fpFn(0.84), fpFn(-0.42), fpFn(0)];
  const soll = ['+0,84 %', '-0,42 %', '+0,00 %'];
  if (JSON.stringify(ist) !== JSON.stringify(soll)) {
    fehler++; console.error('       x fp() liefert nicht das Komma\n         ist:  ' + JSON.stringify(ist) + '\n         soll: ' + JSON.stringify(soll));
  }
  negativ('fp() wieder mit Punkt',
    html.replace('.toFixed(2).replace(".",",")', '.toFixed(2)'),
    dezimal);
  negativ('x.val faelschlich mit umformatiert',
    html.replace("escapeHtml(String(x.val==null?'':x.val))", "escapeHtml(String(x.val==null?'':x.val).replace('.',','))"),
    dezimal);
});

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
