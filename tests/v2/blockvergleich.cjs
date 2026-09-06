/* Blockvergleich zur Zeichengleichheitszusage aus Auftrag V2-2, Teil D.1.
   Aufruf:  node tests/v2/blockvergleich.cjs
   Exit 0 = jeder zugesagte Block ist in v2.html zeichengleich vorhanden.

   Zeichengleich zugesagt sind ausdrücklich openStock und buildStk. closeStk und
   chartOpts werden mitverglichen, weil sie im selben Aufrufpfad liegen.
   applyStkLevels ist bewusst NICHT zeichengleich (der Fib-Zweig greift auf den
   Kandidaten-Unterbau zu, den V2-2 nicht vorzieht) und wird deshalb nur auf den
   levels-Zweig hin verglichen. */
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const v1 = fs.readFileSync(path.join(wurzel, 'index.html'), 'utf8');
const v2 = fs.readFileSync(path.join(wurzel, 'v2.html'), 'utf8');

const NAECHSTE = /^(?:\/\*|\/\/|function |const |let |var |async function |document\.|addEventListener|window\.)/;
function schneide(html, name) {
  const start = html.indexOf('\nfunction ' + name + '(');
  if (start < 0) return null;
  const zeilen = html.slice(start + 1).split('\n');
  const out = [zeilen[0]];
  for (let i = 1; i < zeilen.length; i++) {
    if (NAECHSTE.test(zeilen[i])) break;
    out.push(zeilen[i]);
  }
  return out.join('\n').replace(/\s+$/, '');
}

const ZEICHENGLEICH = ['openStock', 'buildStk', 'closeStk', 'chartOpts'];
let fehler = 0;

ZEICHENGLEICH.forEach(name => {
  const a = schneide(v1, name), b = schneide(v2, name);
  if (a === null) { fehler++; console.error('FEHLER ' + name + ': in index.html nicht gefunden'); return; }
  if (b === null) { fehler++; console.error('FEHLER ' + name + ': in v2.html nicht gefunden'); return; }
  if (a === b) {
    console.log('ok     ' + name + ' zeichengleich (' + a.length + ' Zeichen)');
  } else {
    fehler++;
    console.error('FEHLER ' + name + ' weicht ab');
    const za = a.split('\n'), zb = b.split('\n');
    for (let i = 0; i < Math.max(za.length, zb.length); i++) {
      if (za[i] !== zb[i]) {
        console.error('       Zeile ' + (i + 1) + '\n       V1: ' + String(za[i]).slice(0, 120) +
          '\n       V2: ' + String(zb[i]).slice(0, 120));
        break;
      }
    }
  }
});

/* applyStkLevels: der levels-Zweig muss Zeile für Zeile aus V1 stammen. */
const a = schneide(v1, 'applyStkLevels'), b = schneide(v2, 'applyStkLevels');
if (!a || !b) { fehler++; console.error('FEHLER applyStkLevels nicht gefunden'); }
else {
  const norm = s => s.split('\n').map(x => x.trim()).filter(Boolean);
  const fehlend = norm(b).filter(z => norm(a).indexOf(z) < 0);
  if (fehlend.length) {
    fehler++;
    console.error('FEHLER applyStkLevels enthält Zeilen ohne Vorbild in index.html:');
    fehlend.forEach(z => console.error('       ' + z.slice(0, 120)));
  } else {
    const fib = /candFibDate|CAND_FIB_RATIO_LABEL/.test(b);
    if (fib) { fehler++; console.error('FEHLER applyStkLevels zieht den Kandidaten-Unterbau vor'); }
    else console.log('ok     applyStkLevels: levels-Zweig aus V1, Fib-Zweig bewusst weggelassen');
  }
}

/* Gegenprobe: der Zufallskerzen-Fallback darf in v2.html nicht als CODE vorkommen
   (Teil D.4). Kommentare dürfen ihn benennen — sie erklären ja gerade, warum er
   fehlt —, deshalb werden Kommentare vorher entfernt. */
const v2Code = (v2.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi) || []).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
['candlesGen', 'resData'].forEach(n => {
  const treffer = new RegExp('(?:function\\s+' + n + '\\s*\\(|\\b' + n + '\\s*\\()').test(v2Code);
  if (treffer) { fehler++; console.error('FEHLER v2.html ruft ' + n + ' auf — Zufallskerzen sind ausgeschlossen'); }
  else console.log('ok     ' + n + ' wird in v2.html nirgends aufgerufen');
});

console.log('BLOCKVERGLEICH ' + (fehler === 0 ? 'OK' : 'FEHLER') + ' fehler=' + fehler);
process.exit(fehler === 0 ? 0 : 1);
