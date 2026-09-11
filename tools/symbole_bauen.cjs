/* Baut die Symbolliste für die Suche im Raum „Meine Werte" (stammdaten/symbole.json).
   Aufruf:  node tools/symbole_bauen.cjs [--quelle <ordner>] [--ziel <datei>]

   Quellen — beide frei nutzbar, keine Datenbankrechte in der EU (US-Hersteller):
     1. SEC, company_tickers_exchange.json — Werk einer US-Behörde, gemeinfrei
        (17 U.S.C. § 105). Liefert CIK, Name, Ticker, Börse für alle SEC-registrierten Firmen.
        Die SEC verlangt für automatisierte Abrufe einen User-Agent mit Kontaktadresse
        (Fair-Access-Regel, max. 10 Anfragen/s) — deshalb muss die Umgebungsvariable
        AA_SEC_UA gesetzt sein, z. B. "Aktien Atzen kontakt@example.org". Sie wird NICHT
        in die Ausgabedatei geschrieben.
     2. Nasdaq Trader Symbol Directory, nasdaqlisted.txt + otherlisted.txt — Namen in
        Schreibschrift und ETF-Kennzeichen für alle an US-Börsen notierten Wertpapiere.

   Was die Liste NICHT ist: keine Kursquelle, keine Firmendaten, keine Empfehlung. Sie
   beantwortet nur „welches Symbol meint der Nutzer, wenn er ‚Nu Holdings' tippt".
   Die Symbole stehen in der Schreibweise, die quotes.json und der Kursabruf verwenden
   (Yahoo-Konvention: BRK-B, nicht BRK.B).

   Bewusst ausgeschlossen (jeweils gezählt und im Lauf ausgegeben): Testemissionen,
   Optionsscheine, Bezugsrechte, SPAC-Units, Vorzugsaktien und Anleihen (aus dem Namen
   erkannt), Symbole ausserhalb des Musters /^[A-Z]{1,5}(-[A-Z])?$/ (der Bindestrich
   trägt nur Aktiengattungen wie BRK-B; -PL o. ä. wären Vorzugsaktien), SEC-Einträge ohne
   Börse und OTC-Zweitnotierungen von Firmen, die schon an Nasdaq/NYSE stehen (SAPGF). OTC-Notierungen bleiben ENTHALTEN, weil dort die US-Zweitnotierungen vieler
   ausländischer Firmen liegen (Tencent, BYD, Bayer …), die der Kanal auch bespricht; die
   Suche reiht sie hinter die Hauptbörsen.

   Die Xetra-Instrumentenliste der Deutschen Börse wird ABSICHTLICH nicht verwendet:
   Deutsche Börse ist EU-Hersteller, die Liste ein geschütztes Datenbankwerk (§ 87b UrhG) —
   Nutzerentscheid 11.09.2026, Stufe 1 = US komplett plus die Feeds. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ARGS = process.argv.slice(2);
function arg(name, fallback) {
  const i = ARGS.indexOf(name);
  return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : fallback;
}
const QUELLE = arg('--quelle', path.join(os.tmpdir(), 'aa-symbole'));
const ZIEL = arg('--ziel', path.join(__dirname, '..', 'stammdaten', 'symbole.json'));

const DATEIEN = {
  'company_tickers_exchange.json': 'https://www.sec.gov/files/company_tickers_exchange.json',
  'nasdaqlisted.txt': 'https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt',
  'otherlisted.txt': 'https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt'
};

function laden(url, ua) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': ua, 'Accept-Encoding': 'identity' } }, r => {
      if (r.statusCode !== 200) { reject(new Error(url + ' → HTTP ' + r.statusCode)); r.resume(); return; }
      const teile = [];
      r.on('data', t => teile.push(t));
      r.on('end', () => resolve(Buffer.concat(teile)));
    }).on('error', reject);
  });
}

async function quellenHolen() {
  fs.mkdirSync(QUELLE, { recursive: true });
  const fehlend = Object.keys(DATEIEN).filter(d => !fs.existsSync(path.join(QUELLE, d)));
  if (!fehlend.length) { console.log('Quellen aus ' + QUELLE); return; }
  const ua = process.env.AA_SEC_UA;
  if (!ua || !/@/.test(ua)) {
    console.error('AA_SEC_UA fehlt (Kennung mit Kontaktadresse, von der SEC verlangt). Abbruch.');
    process.exit(2);
  }
  for (const d of fehlend) {
    const b = await laden(DATEIEN[d], ua);
    fs.writeFileSync(path.join(QUELLE, d), b);
    console.log('geladen ' + d + ' (' + b.length + ' B)');
  }
}

/* --- Aufbereitung ------------------------------------------------------------- */
const BOERSE_OTHER = { A: 'NYSE American', N: 'NYSE', P: 'NYSE Arca', Z: 'Cboe BZX', V: 'IEX' };
const BOERSE_SEC = { Nasdaq: 'Nasdaq', NYSE: 'NYSE', OTC: 'OTC', CBOE: 'Cboe' };

/* Gattungen, die kein Nutzer als „Wert" anlegen will — sie verstopfen nur die Vorschläge. */
const AUSSCHLUSS = /\b(warrants?|rights?|units?|preferred|pref\.?|preference|notes?|debentures?|bonds?|subordinated|trust preferred|deposit[ao]ry shares?,? each|series [a-z]\b)/i;

/* Namenszusätze der Nasdaq-Liste abstreifen: „Nu Holdings Ltd. Class A Ordinary Shares"
   wird zu „Nu Holdings Ltd.". Mehrere Durchgänge, weil Zusätze geschachtelt vorkommen. */
const ZUSAETZE = [
  [/ - .*$/, ''],
  [/\s*\(each .*\)$/i, ''],
  [/\s*\((ireland|uk|u\.?s\.?a?\.?|delaware|cayman islands|canada|bermuda)\)$/i, ''],
  [/\s*\(\$?[\d.,]+ par value\)$/i, ''],
  [/\s+american deposit[ao]ry (shares?|receipts?)$/i, ''],
  [/\s+(common\s+)?shares of beneficial interest$/i, ''],
  [/(\betf)\s+shares$/i, '$1'],
  /* Nur bekannte Gattungswörter vor „Shares/Stock" — eine offene Wortfolge würde ab dem
     ersten Leerzeichen fressen („Eli Lilly and Company Common Stock" → „Eli"). */
  [/\s+((class [a-z]|common|ordinary|capital|new|limited|subordinate|multiple|non-voting|voting|restricted|depositary)\s+)*(shares?|stock)$/i, ''],
  [/\s+ads$/i, ''], [/\s+adr$/i, ''], [/\s+new$/i, ''], [/\s+\(new\)$/i, ''],
  [/\s*\/[a-z ]{2,4}\/$/i, '']
];
function nameSaeubern(roh) {
  let n = String(roh || '').replace(/\s+/g, ' ').trim();
  for (let runde = 0; runde < 3; runde++) {
    for (const [re, ersatz] of ZUSAETZE) { const k = n.replace(re, ersatz).trim(); if (k.length >= 2) n = k; }
  }
  return n.trim();
}

/* SEC-Namen sind oft Grossbuchstaben („AMAZON COM INC"). Für Einträge, die die Nasdaq-Liste
   nicht kennt, wird vorsichtig in Schreibschrift gewandelt; kurze Kürzel (SAP, AG, SE, PLC)
   bleiben stehen. */
const KURZ = new Set(['AG', 'SE', 'PLC', 'NV', 'SA', 'SPA', 'ASA', 'AB', 'OYJ', 'LP', 'LLC', 'ADR', 'ADS', 'ETF']);
const KLEIN = new Set(['of', 'and', 'the', 'de', 'del', 'la', 'du', 'y', 'da', 'di', 'e', 'for']);
function schreibschrift(roh) {
  const n = nameSaeubern(roh);
  if (n !== n.toUpperCase()) return n;
  return n.split(' ').map((w, i) => {
    const kern = w.replace(/[.,]/g, '');
    if (i > 0 && KLEIN.has(kern.toLowerCase())) return w.toLowerCase();
    if (w.length <= 3 || KURZ.has(kern)) return w;
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join(' ');
}

const SYMBOL_OK = /^[A-Z]{1,5}(-[A-Z])?$/;
function symbolNorm(s) {
  return String(s || '').trim().toUpperCase().replace(/\./g, '-');
}

function nasdaqZeilen(datei) {
  const t = fs.readFileSync(path.join(QUELLE, datei), 'utf8').split(/\r?\n/);
  const kopf = t[0].split('|');
  return t.slice(1).filter(l => l && !/^File Creation Time/.test(l)).map(l => {
    const f = l.split('|'), o = {};
    kopf.forEach((k, i) => { o[k] = f[i]; });
    return o;
  });
}

function bauen() {
  const zaehler = { test: 0, gattung: 0, symbol: 0, secOhneBoerse: 0, otcZweit: 0, secNeu: 0, nasdaq: 0, other: 0 };
  const map = {};
  /* Was die Nasdaq-Liste als Optionsschein, Unit oder Recht ausweist, darf die SEC-Liste
     nicht unter dem Firmennamen zurückbringen (NUAIW stünde sonst als „New Era Energy"). */
  const verworfen = new Set();
  const merke = (sym, name, boerse, typ) => {
    if (!SYMBOL_OK.test(sym)) { zaehler.symbol++; return; }
    if (!name) return;
    if (!map[sym]) map[sym] = { symbol: sym, name, boerse, typ };
  };

  for (const z of nasdaqZeilen('nasdaqlisted.txt')) {
    if (z['Test Issue'] === 'Y') { zaehler.test++; continue; }
    if (AUSSCHLUSS.test(z['Security Name'])) { zaehler.gattung++; verworfen.add(symbolNorm(z.Symbol)); continue; }
    zaehler.nasdaq++;
    merke(symbolNorm(z.Symbol), nameSaeubern(z['Security Name']), 'Nasdaq', z.ETF === 'Y' ? 'etf' : 'aktie');
  }
  for (const z of nasdaqZeilen('otherlisted.txt')) {
    if (z['Test Issue'] === 'Y') { zaehler.test++; continue; }
    if (AUSSCHLUSS.test(z['Security Name'])) { zaehler.gattung++; verworfen.add(symbolNorm(z['ACT Symbol'])); continue; }
    zaehler.other++;
    merke(symbolNorm(z['ACT Symbol']), nameSaeubern(z['Security Name']),
      BOERSE_OTHER[z.Exchange] || 'US', z.ETF === 'Y' ? 'etf' : 'aktie');
  }

  const sec = JSON.parse(fs.readFileSync(path.join(QUELLE, 'company_tickers_exchange.json'), 'utf8'));
  const ix = { cik: sec.fields.indexOf('cik'), name: sec.fields.indexOf('name'), ticker: sec.fields.indexOf('ticker'), ex: sec.fields.indexOf('exchange') };
  /* Eine Firma, die an Nasdaq/NYSE notiert ist, taucht bei der SEC oft zusätzlich mit einem
     OTC-Kürzel auf (SAP → SAPGF). Diese Zweitnotierungen verwirren die Vorschläge nur. */
  const gelistet = new Set(sec.data.filter(r => r[ix.ex] && r[ix.ex] !== 'OTC').map(r => r[ix.cik]));
  for (const r of sec.data) {
    const boerse = BOERSE_SEC[r[ix.ex]];
    if (!boerse) { zaehler.secOhneBoerse++; continue; }
    if (boerse === 'OTC' && gelistet.has(r[ix.cik])) { zaehler.otcZweit++; continue; }
    const sym = symbolNorm(r[ix.ticker]);
    if (map[sym]) continue;
    if (verworfen.has(sym)) { zaehler.gattung++; continue; }
    /* Nasdaq-Konvention: fünfter Buchstabe W/R/U = Optionsschein/Recht/Unit zum
       vierstelligen Stammsymbol — auch dann, wenn die Nasdaq-Liste den Eintrag nicht führt. */
    if (/^[A-Z]{4}[WRU]$/.test(sym) && (map[sym.slice(0, 4)] || verworfen.has(sym.slice(0, 4)))) { zaehler.gattung++; continue; }
    const name = schreibschrift(r[ix.name]);
    if (AUSSCHLUSS.test(name)) { zaehler.gattung++; continue; }
    if (!SYMBOL_OK.test(sym)) { zaehler.symbol++; continue; }
    map[sym] = { symbol: sym, name, boerse, typ: 'aktie' };
    zaehler.secNeu++;
  }

  /* Letzter Durchgang, quellenunabhängig: fünfter Buchstabe W/R/U zu einem vorhandenen
     vierstelligen Stammsymbol ist nach Nasdaq-Konvention Optionsschein, Recht oder Unit —
     auch wenn der Listenname es nicht sagt (PSNYW hiess schlicht „Polestar …"). */
  Object.keys(map).forEach(s => { if (/^[A-Z]{4}[WRU]$/.test(s) && map[s.slice(0, 4)]) { delete map[s]; zaehler.gattung++; } });
  const eintraege = Object.keys(map).sort().map(s => [map[s].symbol, map[s].name, map[s].boerse, map[s].typ]);
  const boersen = {}, typen = {};
  eintraege.forEach(e => { boersen[e[2]] = (boersen[e[2]] || 0) + 1; typen[e[3]] = (typen[e[3]] || 0) + 1; });
  return { eintraege, zaehler, boersen, typen };
}

(async () => {
  await quellenHolen();
  const b = bauen();
  const heute = new Date().toISOString().slice(0, 10);
  const aus = {
    stand: heute,
    hinweis: 'Symbolliste für die Sucheingabe — keine Kurs- oder Firmendaten. Erzeugt mit tools/symbole_bauen.cjs.',
    quellen: [
      'SEC company_tickers_exchange.json (US-Behörde, gemeinfrei) — ' + DATEIEN['company_tickers_exchange.json'],
      'Nasdaq Trader Symbol Directory (nasdaqlisted.txt, otherlisted.txt) — https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs'
    ],
    felder: ['symbol', 'name', 'boerse', 'typ'],
    eintraege: b.eintraege
  };
  fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
  const text = JSON.stringify(aus).replace(/\],\[/g, '],\n[');
  fs.writeFileSync(ZIEL, text + '\n');
  console.log('SYMBOLE_BAUEN OK stand=' + heute + ' eintraege=' + b.eintraege.length +
    ' bytes=' + Buffer.byteLength(text) + ' boersen=' + JSON.stringify(b.boersen) +
    ' typen=' + JSON.stringify(b.typen) + ' ausgeschlossen=' + JSON.stringify(b.zaehler));
})().catch(e => { console.error('SYMBOLE_BAUEN FEHLER ' + e.message); process.exit(1); });
