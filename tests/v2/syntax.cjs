/* Syntaxpruefung fuer v2.html.
   Schneidet jeden Inline-<script>-Block heraus und laesst ihn von node parsen.
   Aufruf:  node tests/v2/syntax.cjs
   Exit 0 = alle Bloecke parsen, Exit 1 = mindestens ein Block ist kaputt. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const datei = path.join(__dirname, '..', '..', 'v2.html');
const html = fs.readFileSync(datei, 'utf8');

const bloecke = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html)) !== null) {
  const vorher = html.slice(0, m.index);
  bloecke.push({ zeile: vorher.split('\n').length, code: m[1] });
}

let fehler = 0;
bloecke.forEach((b, i) => {
  try {
    new vm.Script(b.code, { filename: `v2.html:${b.zeile}` });
    console.log(`ok    Block ${i + 1} (ab Zeile ${b.zeile}, ${b.code.length} Zeichen)`);
  } catch (e) {
    fehler++;
    console.error(`FEHLER Block ${i + 1} (ab Zeile ${b.zeile}): ${e.message}`);
  }
});

console.log(`SYNTAX ${fehler === 0 ? 'OK' : 'FEHLER'} bloecke=${bloecke.length} fehler=${fehler}`);
process.exit(fehler === 0 ? 0 : 1);
