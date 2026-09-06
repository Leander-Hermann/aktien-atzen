/* Lokaler Vorschauserver fuer v2.html — nur Loopback, nur lesend.
   Aufruf:  node tests/v2/preview.cjs [port]
   Grund: die Seite laedt ihre Feeds per fetch aus data/; ueber file:// blockiert
   der Browser diese Anfragen, und man prueft dann eine Seite ohne Daten. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const port = Number(process.argv[2]) || 8732;

/* Störmodus für die Ausfallprüfung (Auftrag V2-2, DoD-Zeile „Ausfälle"):
   node tests/v2/preview.cjs 8733 --stoere market.json=404,quotes.json=muell,radar.json=struktur
   404 = Datei fehlt · muell = ungültiges JSON · struktur = gültiges JSON, falscher Aufbau */
const stoerung = {};
const argStoer = process.argv.indexOf('--stoere');
if (argStoer > -1 && process.argv[argStoer + 1]) {
  process.argv[argStoer + 1].split(',').forEach(p => {
    const [datei, art] = p.split('=');
    if (datei && art) stoerung[datei.trim()] = art.trim();
  });
  console.log('Störmodus:', JSON.stringify(stoerung));
}

/* Fallback-Erzwingung für die Pflichtprüfung aus V2-6 Teil D.4: der Block
   `@supports not (container-type:inline-size)` greift in einer Engine, die
   Container Queries kann, nie. Mit --fallback wird beim Ausliefern von v2.html
   genau diese eine Bedingung invertiert — die Deklarationen darin bleiben
   unveraendert, es wird also der echte Rueckfallpfad gerendert, nicht ein
   nachgebauter.
   Aufruf:  node tests/v2/preview.cjs 8742 --fallback */
const fallback = process.argv.includes('--fallback');
if (fallback) console.log('Fallback-Modus: @supports not (container-type:inline-size) wird erzwungen');

const TYP = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  const roh = decodeURIComponent(req.url.split('?')[0]);
  const rel = roh === '/' ? '/v2.html' : roh;
  const ziel = path.join(wurzel, rel);
  // Kein Ausbruch aus dem Repoordner
  if (!ziel.startsWith(wurzel)) {
    res.writeHead(403).end('verboten');
    return;
  }
  const art = stoerung[path.basename(rel)];
  if (art) {
    if (art === '404') { res.writeHead(404, { 'content-type': 'text/plain' }).end('gestoert: fehlt'); return; }
    if (art === 'muell') { res.writeHead(200, { 'content-type': 'application/json' }).end('{das ist kein json,,,'); return; }
    if (art === 'struktur') { res.writeHead(200, { 'content-type': 'application/json' }).end('{"unerwartet":[1,2,3]}'); return; }
  }
  fs.readFile(ziel, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('nicht gefunden: ' + rel);
      return;
    }
    if (fallback && /v2\.html$/.test(rel)) {
      const roh = buf.toString('utf8');
      /* Eine Engine ohne Container Queries kennt drei Dinge nicht: die
         @supports-Bedingung (sie ist dort wahr), die Deklaration container-type
         und die Regel @container. Alle drei werden hier nachgestellt, damit der
         Lauf den echten Rueckfallpfad zeigt und nicht nur den umgeschalteten
         Block. Die Deklarationen im Fallback selbst bleiben unveraendert. */
      const neu = roh
        .replace('@supports not (container-type:inline-size)', '@supports (--erzwungener-fallback:1)')
        .replace(/container-type:inline-size/g, 'container-type:normal')
        .replace(/@container \(min-width:\s*[\d.]+px\)/g, '@media (min-width:99999px)');
      if (neu === roh) console.warn('WARNUNG: kein @supports-not-Block gefunden — Fallback nicht erzwungen');
      res.writeHead(200, { 'content-type': TYP['.html'] });
      res.end(neu);
      return;
    }
    res.writeHead(200, { 'content-type': TYP[path.extname(ziel).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', () => {
  console.log('v2-Vorschau auf http://127.0.0.1:' + port + '/v2.html');
});
