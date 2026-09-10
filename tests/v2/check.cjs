/* Deterministische Prüfung der Auswahl- und Validierungslogik im Raum „Jetzt" (V2-2).
   Aufruf:  node tests/v2/check.cjs
   Exit 0 = alle Gruppen grün, Exit 1 = mindestens ein Fall fehlgeschlagen.

   Die Funktionen werden namentlich aus v2.html geschnitten und in einer vm-Sandbox
   ausgeführt — es wird also der ausgelieferte Quelltext geprüft, keine Kopie.
   Zu jedem Kriterium gehört mindestens ein NEGATIVER Fall (ADR-315.2). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'v2.html'), 'utf8');

/* Eine Funktion samt Rumpf aus dem Quelltext schneiden.
   Klammern zu zählen scheitert an regulären Ausdrücken wie dem in safeUrl, die
   Anführungszeichen und Backticks als Zeichenklasse enthalten. Alle geprüften
   Funktionen stehen auf Modulebene, deshalb wird bis zur nächsten Deklaration
   am Zeilenanfang geschnitten — das ist an dieser Datei eindeutig. */
const NAECHSTE = /^(?:\/\*|\/\/|function |const |let |var |async function |document\.|addEventListener|window\.)/;
function schneide(name) {
  const start = html.indexOf('\nfunction ' + name + '(');
  if (start < 0) throw new Error('Funktion nicht gefunden: ' + name);
  const zeilen = html.slice(start + 1).split('\n');
  const out = [zeilen[0]];
  for (let i = 1; i < zeilen.length; i++) {
    if (NAECHSTE.test(zeilen[i])) break;
    out.push(zeilen[i]);
  }
  return out.join('\n');
}

const NAMEN = ['escapeHtml', 'safeUrl', 'safeLink', 'jzPrioWert', 'jzPrioLabel', 'jzTopics',
  'jzKerzenOk', 'jzMoverGruppe', 'jzMoverAuswahl', 'jzZeitmarke', 'jzFett', 'jzBogenHTML', 'fp',
  /* V2-3 Raum „Radar" */
  'validTicker', 'jzTag', 'jzUhr', 'jzFarbe', 'bstToday', 'bstSymbole', 'rdZeitText', 'rdPrioChip',
  'rdKerzen', 'rdChartKnopfHTML', 'rdLlmHTML', 'rdSignalKarte', 'rdWochentag', 'rdTermineFenster', 'rdZahl',
  'rdLevelsOk', 'rdLevelsHTML', 'rdKandidatKarte'];

/* Konstanten-Tabellen (RD_ZEIT, RD_READY …) sind keine Funktionsdeklarationen und
   werden mit demselben Verfahren geschnitten: ab `const NAME=` bis zur naechsten
   Deklaration am Zeilenanfang. */
const KONSTANTEN = ['RD_ZEIT', 'RD_READY', 'RD_REGEL', 'RD_RISIKO', 'RD_DQ'];
function schneideConst(name) {
  const start = html.indexOf('\nconst ' + name + '=');
  if (start < 0) throw new Error('Konstante nicht gefunden: ' + name);
  const zeilen = html.slice(start + 1).split('\n');
  const out = [zeilen[0]];
  for (let i = 1; i < zeilen.length; i++) {
    if (NAECHSTE.test(zeilen[i])) break;
    out.push(zeilen[i]);
  }
  return out.join('\n');
}

/* URL gehört in die Sandbox: safeUrl prüft das Schema über new URL(...) und würde
   ohne die Klasse jede Adresse per catch verwerfen — das wäre ein Testartefakt. */
const box = { current: null, DATA: {}, MARKET: null, FGDATA: null, console, URL,
  RADAR: null, QUOTES: null, EARN: null, CANDIDATES: null, BESTAND: null };
vm.createContext(box);
vm.runInContext(KONSTANTEN.map(schneideConst).join('\n') + '\n' +
  NAMEN.map(schneide).join('\n'), box, { filename: 'v2.html-auszug' });
/* bstSymbole liest den localStorage ueber bstLoad(); in der Sandbox gibt es keinen.
   Ersetzt wird deshalb genau diese eine Abhaengigkeit, nicht die geprueften
   Funktionen selbst — der Bestandsbezug der Terminliste wird darueber gesteuert. */
vm.runInContext('let BST_TEST=[];function bstSymbole(){return BST_TEST}', box);

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
  if (a !== b) { fehler++; console.error('       ✗ ' + name + '\n         ist:  ' + a + '\n         soll: ' + b); }
}

/* --- Kriterium 1: Digest-Auswahl (Teil A.1) ---------------------------------- */
gruppe('Kriterium 1 — Digest-Auswahl, Sortierung, Stabilität', () => {
  box.current = '2026-09-06';
  const eingabe = [
    { title: 'A prio1', prio: 1 }, { title: 'B prio3', prio: 3 }, { title: 'C prio2', prio: 2 },
    { title: 'D prio3', prio: 3 }, { prio: 3 }, { title: 'F prio9', prio: 9 }
  ];
  box.DATA = { '2026-09-06': { topics: eingabe } };
  const t = vm.runInContext('jzTopics()', box);
  pruef('prio absteigend, Gleichstand stabil', t.map(x => x.title),
    ['B prio3', 'D prio3', 'C prio2', 'A prio1', 'F prio9']);
  pruef('Topic ohne Titel entfällt', t.filter(x => !x.title).length, 0);
  pruef('ungültige prio gilt nicht als höchste', vm.runInContext('jzPrioWert({prio:9})', box), 0);
  pruef('ungültige prio bekommt kein Label', vm.runInContext('jzPrioLabel({prio:9})', box), null);
  /* NEGATIV: das Feedobjekt darf nicht umsortiert worden sein */
  pruef('Eingabereihenfolge unverändert', eingabe.map(x => x.title || '(ohne)'),
    ['A prio1', 'B prio3', 'C prio2', 'D prio3', '(ohne)', 'F prio9']);
  /* NEGATIV: keine Auffüllung bei zu wenigen Topics */
  box.DATA = { '2026-09-06': { topics: [{ title: 'nur eins', prio: 2 }] } };
  pruef('1 Topic ergibt 1 Eintrag, keine Auffüllung', vm.runInContext('jzTopics().length', box), 1);
  box.DATA = { '2026-09-06': { topics: [] } };
  pruef('0 Topics ergeben 0 Einträge', vm.runInContext('jzTopics().length', box), 0);
  box.DATA = { '2026-09-06': {} };
  pruef('fehlendes topics-Feld wirft nicht', vm.runInContext('jzTopics().length', box), 0);
  box.DATA = { '2026-09-06': { topics: 'kaputt' } };
  pruef('strukturell falsches topics wirft nicht', vm.runInContext('jzTopics().length', box), 0);
});

/* --- Kriterium 3: Escaping und Linksicherheit (ADR-025) ---------------------- */
gruppe('Kriterium 3 — Escaping und Linksicherheit', () => {
  pruef('Script-Nutzlast wird Text',
    vm.runInContext('escapeHtml("<script>alert(1)<\\/script>")', box),
    '&lt;script&gt;alert(1)&lt;/script&gt;');
  /* NEGATIV: unsichere Schemata und http ergeben KEINEN Link */
  pruef('javascript: ergibt keinen Link', vm.runInContext('safeUrl("javascript:alert(1)")', box), '');
  pruef('http: ergibt keinen Link', vm.runInContext('safeUrl("http://example.org")', box), '');
  pruef('kaputte URL ergibt keinen Link', vm.runInContext('safeUrl("nicht mal eine url")', box), '');
  pruef('https bleibt', vm.runInContext('safeUrl("https://example.org/a")', box), 'https://example.org/a');
  pruef('safeLink ohne sichere URL liefert nur Text',
    vm.runInContext('safeLink("javascript:x","Klick")', box), 'Klick');
  pruef('safeLink setzt noopener',
    vm.runInContext('safeLink("https://e.org","T").indexOf(\'rel="noopener noreferrer"\')>0', box), true);
  /* Fett-Auszeichnung erst NACH dem Escaping */
  pruef('**fett** nach Escaping', vm.runInContext('jzFett("a **b** c")', box), 'a <b>b</b> c');
  pruef('Markup zwischen Sternen bleibt Text',
    vm.runInContext('jzFett("**<img src=x onerror=1>**")', box),
    '<b>&lt;img src=x onerror=1&gt;</b>');
});

/* --- Kriterium 5 (Teil): Zeitmarke im Videolink ------------------------------ */
gruppe('Kriterium 5 — Zeitmarke im Videolink', () => {
  pruef('t= wird gelesen', vm.runInContext('jzZeitmarke("https://y.t/w?v=A&t=277s")', box), '4:37');
  pruef('t= ohne s', vm.runInContext('jzZeitmarke("https://y.t/w?v=A&t=653")', box), '10:53');
  /* NEGATIV: fehlende oder unbrauchbare Marke wird NIE erfunden */
  pruef('ohne t= keine Marke', vm.runInContext('jzZeitmarke("https://y.t/w?v=A")', box), null);
  pruef('t=0 zählt nicht als Marke', vm.runInContext('jzZeitmarke("https://y.t/w?v=A&t=0s")', box), null);
  pruef('unbrauchbares t= ergibt null', vm.runInContext('jzZeitmarke("https://y.t/w?v=A&t=abc")', box), null);
});

/* --- Kriterium 6: Fear & Greed --------------------------------------------- */
gruppe('Kriterium 6 — Fear-&-Greed-Gültigkeit', () => {
  const bogen = s => { box.FGDATA = s; return vm.runInContext('jzBogenHTML()', box); };
  pruef('Score 41,9 ergibt einen Bogen', bogen({ score: 41.9, rating: 'fear' }).length > 0, true);
  pruef('Score 0 ist gültig', bogen({ score: 0, rating: 'extreme fear' }).length > 0, true);
  pruef('Score 100 ist gültig', bogen({ score: 100, rating: 'extreme greed' }).length > 0, true);
  pruef('Rating wird escaped', bogen({ score: 50, rating: '<b>x</b>' }).indexOf('&lt;b&gt;') > 0, true);
  /* NEGATIV: alles Ungültige lässt GENAU diese Teilfläche entfallen */
  pruef('null ergibt keine Fläche', bogen(null), '');
  pruef('score null ergibt keine Fläche', bogen({ score: null }), '');
  pruef('score als String ergibt keine Fläche', bogen({ score: '41.9' }), '');
  pruef('score 101 ergibt keine Fläche', bogen({ score: 101 }), '');
  pruef('score -1 ergibt keine Fläche', bogen({ score: -1 }), '');
  pruef('score NaN ergibt keine Fläche', bogen({ score: NaN }), '');
});

/* --- Kriterium 7: Moverauswahl (Teil C.3) ----------------------------------- */
gruppe('Kriterium 7 — Moverauswahl, höchstens fünf insgesamt', () => {
  const setz = m => { box.MARKET = m; };
  setz({
    gainers: [{ t: 'G1', n: 'g1', p: 11.9 }, { t: 'G2', n: 'g2', p: 10.3 }, { t: 'G3', n: 'g3', p: 9.75 }],
    losers: [{ t: 'L1', n: 'l1', p: -19.93 }, { t: 'L2', n: 'l2', p: -17.38 }, { t: 'G1', n: 'g1', p: 11.9 }],
    actives: [{ t: 'A1', n: 'a1', p: 0 }, { t: 'A2', n: 'a2', p: 4.5 }]
  });
  const a = vm.runInContext('jzMoverAuswahl()', box);
  pruef('höchstens fünf insgesamt', a.length, 5);
  pruef('nach absoluter Tagesänderung sortiert', a.map(x => x.t), ['L1', 'L2', 'G1', 'G2', 'G3']);
  pruef('gleiches Symbol nur einmal', a.filter(x => x.t === 'G1').length, 1);
  /* Auffüllung aus actives, wenn Gewinner und Verlierer nicht reichen */
  setz({ gainers: [{ t: 'G1', n: 'g', p: 1 }], losers: [], actives: [{ t: 'A1', n: 'a', p: 0 }, { t: 'A2', n: 'b', p: 2 }] });
  pruef('Auffüllung aus actives in Lieferreihenfolge',
    vm.runInContext('jzMoverAuswahl().map(x=>x.t)', box), ['G1', 'A1', 'A2']);
  pruef('p = 0 bleibt gültig',
    vm.runInContext('jzMoverAuswahl().filter(x=>x.p===0).length', box), 1);
  /* Gleichstand behält die Lieferreihenfolge */
  setz({ gainers: [{ t: 'X', n: 'x', p: 5 }, { t: 'Y', n: 'y', p: 5 }], losers: [{ t: 'Z', n: 'z', p: -5 }], actives: [] });
  pruef('Gleichstand in Lieferreihenfolge',
    vm.runInContext('jzMoverAuswahl().map(x=>x.t)', box), ['X', 'Y', 'Z']);
  /* NEGATIV: kaputte und leere Gruppen */
  setz({ gainers: null, losers: 'kaputt', actives: [{ t: 'A', n: 'a', p: NaN }, { t: '', n: 'x', p: 1 }, null] });
  pruef('kaputte Gruppen und Einträge ergeben nichts',
    vm.runInContext('jzMoverAuswahl().length', box), 0);
  setz({});
  pruef('fehlende Gruppen werfen nicht', vm.runInContext('jzMoverAuswahl().length', box), 0);
});

/* --- Teil D.5: Kerzenvalidierung ------------------------------------------- */
gruppe('Teil D.5 — Kerzenvalidierung vor dem Chartkern', () => {
  const k = (o, h, l, c, t) => ({ time: t, open: o, high: h, low: l, close: c });
  pruef('gültige Reihe bleibt',
    vm.runInContext('jzKerzenOk([{time:1,open:1,high:2,low:0.5,close:1.5},{time:2,open:1.5,high:2,low:1,close:1.8}]).length', box), 2);
  /* NEGATIV: jede Verletzung fliegt raus, nichts wird repariert */
  box.f = [k(1, 2, 0.5, 1.5, 1), k(1, 2, 0.5, 1.5, 1)];
  pruef('doppelter Zeitpunkt fliegt raus', vm.runInContext('jzKerzenOk(f).length', box), 1);
  box.f = [k(1, 2, 0.5, 1.5, 2), k(1, 2, 0.5, 1.5, 1)];
  pruef('absteigende Zeit fliegt raus', vm.runInContext('jzKerzenOk(f).length', box), 1);
  box.f = [k(1, 0.4, 0.5, 1.5, 1)];
  pruef('high unter low fliegt raus', vm.runInContext('jzKerzenOk(f)', box), null);
  box.f = [k(1, 2, 0.5, NaN, 1)];
  pruef('NaN fliegt raus', vm.runInContext('jzKerzenOk(f)', box), null);
  box.f = [k(null, 2, 0.5, 1.5, 1)];
  pruef('null fliegt raus', vm.runInContext('jzKerzenOk(f)', box), null);
  pruef('leere Liste ergibt null', vm.runInContext('jzKerzenOk([])', box), null);
  pruef('kein Array ergibt null', vm.runInContext('jzKerzenOk("kaputt")', box), null);
  pruef('undefined ergibt null', vm.runInContext('jzKerzenOk(undefined)', box), null);
});

/* ======================================================================
   V2-3 Raum „Radar". Zu jedem Kriterium gehoert ein negativer Fall (ADR-315.2).
   ====================================================================== */

/* --- Teil B: Signalkarte ---------------------------------------------------- */
gruppe('V2-3 Teil B — Signalkarte: kein Score, kein roher alert_type, quote nur wenn geliefert', () => {
  box.QUOTES = { quotes: { AAA: { price: 10, cur: 'USD', candles: [
    { time: 1, open: 1, high: 2, low: 0.5, close: 1.5 }, { time: 2, open: 1.5, high: 2, low: 1, close: 1.8 }] } } };
  box.it = { symbol: 'AAA', name: 'Alpha', score: 87, priority: 'high', alert_type: 'large_move',
    triggers: [{ type: 'large_move', label: 'Starke Kursbewegung', value: '+6,5 %', weight: 30 }],
    quote: { price: 83.1, pct: 6.47, cur: 'EUR', as_of: '2026-09-09T06:34:07Z' },
    earnings: { date: '2026-09-10', distance_days: 1, zeit: 'amc' } };
  const h = vm.runInContext('rdSignalKarte(it,"")', box);
  pruef('Name und Symbol stehen in der Karte', /Alpha/.test(h) && /AAA/.test(h), true);
  pruef('Triggerlabel und -wert stehen in der Karte', /Starke Kursbewegung/.test(h) && /\+6,5 %/.test(h), true);
  pruef('Prozentwert mit deutschem Komma', /\+6,47 %/.test(h), true);
  pruef('Kurs mit deutschem Komma', /83,10 EUR/.test(h), true);
  pruef('Earnings-Zeit als deutscher Klartext', /nach Handelsschluss/.test(h), true);
  pruef('Chartknopf, weil Kerzen vorhanden', /data-rdchart="AAA"/.test(h), true);
  const mitKerzen = h;
  /* NEGATIV: der Zahlenwert score darf nirgends auftauchen (Teil B.4) */
  pruef('score 87 steht nicht in der Karte', /(^|[^0-9])87([^0-9]|$)/.test(h), false);
  /* NEGATIV: alert_type wird nicht roh ausgegeben (Teil B.5) */
  pruef('alert_type nicht roh', /large_move/.test(h), false);
  /* NEGATIV: ohne quote entfaellt die Kurszeile ersatzlos, kein Ersatzkurs */
  box.it = { symbol: 'AAA', name: 'Alpha', score: 60, priority: 'medium', triggers: [] };
  const ohne = vm.runInContext('rdSignalKarte(it,"")', box);
  pruef('ohne quote keine Kursangabe', /EUR|USD|jz-gross/.test(ohne), false);
  pruef('ohne Trigger ehrliche Leermeldung', /Keine Auslöser geliefert\./.test(ohne), true);
  pruef('priority medium ergibt den schwächeren Chip', /Aufmerksamkeit/.test(ohne) && !/hohe Aufmerksamkeit/.test(ohne), true);
  /* ADR-714 Punkt 2 (V2-4 Teil E.2): der Chartknopf wird NICHT mehr eingefuegt, sondern
     von Anfang an angelegt und spaeter nur aktiviert. Geprueft werden deshalb alle drei
     Zustaende — der Knopf steht in jedem, der Text ist in jedem zeichengleich, und die
     Sperre haengt ausschliesslich an der Kursreihe. Der frueher hier stehende Fall
     'ohne Kursreihe kein Chartknopf' bildete die vor ADR-714 geltende Lage ab. */
  pruef('Zustand 1 (Kerzen da): Knopf aktiv, nicht gesperrt',
    /data-rdchart="AAA"[^>]*>/.test(mitKerzen) && !/data-rdchart="AAA" disabled/.test(mitKerzen), true);
  box.QUOTES = { quotes: {} };
  const ohneKerzen = vm.runInContext('rdSignalKarte(it,"")', box);
  pruef('Zustand 2 (quotes da, keine Kerzen): Knopf steht und ist gesperrt',
    /data-rdchart="AAA" disabled aria-disabled="true" title="Für diesen Wert nicht geliefert"/.test(ohneKerzen), true);
  box.QUOTES = null;
  const nochNichtDa = vm.runInContext('rdSignalKarte(it,"")', box);
  pruef('Zustand 3 (quotes noch nicht geladen): Knopf steht und nennt den Ladegrund',
    /data-rdchart="AAA" disabled aria-disabled="true" title="Kursdaten werden noch geladen"/.test(nochNichtDa), true);
  const knopfText = h => { const m = h.match(/>(Kursverlauf ansehen)</); return m ? m[1] : ''; };
  pruef('Knopftext in allen drei Zustaenden zeichengleich',
    [knopfText(mitKerzen), knopfText(ohneKerzen), knopfText(nochNichtDa)],
    ['Kursverlauf ansehen', 'Kursverlauf ansehen', 'Kursverlauf ansehen']);
  box.QUOTES = { quotes: {} };
  /* NEGATIV: unsauberes Symbol ergibt gar keine Karte */
  box.it = { symbol: 'AA<script>', name: 'X', triggers: [] };
  pruef('unsauberes Symbol ergibt keine Karte', vm.runInContext('rdSignalKarte(it,"")', box), '');
  /* NEGATIV: Feedinhalt wird geescapet */
  box.QUOTES = null;
  box.it = { symbol: 'AAA', name: '<img src=x onerror=alert(1)>', triggers: [{ label: '<b>x</b>', value: '"y"' }] };
  const esc = vm.runInContext('rdSignalKarte(it,"")', box);
  pruef('Name geescapet', /&lt;img/.test(esc) && !/<img/.test(esc), true);
  pruef('Triggerlabel geescapet', /&lt;b&gt;x&lt;\/b&gt;/.test(esc), true);
  pruef('unbekannte Handelszeit entfällt', vm.runInContext('rdZeitText("tbd")', box), '');
  pruef('leere Priorität ergibt keinen Chip', vm.runInContext('rdPrioChip(undefined)', box), '');
});

/* --- Teil B.9: die KI-Flaeche ---------------------------------------------- */
gruppe('V2-3 Teil B.9 — KI-Fläche nur vollständig, gekennzeichnet, ohne Selbsteinschätzung', () => {
  const voll = { status: 'ready', headline: 'Kopfzeile', why_now: 'Begründung.',
    watch_next: ['a', 'b', 'c', 'd', 'e'], confidence: 'low', generated_at: '2026-09-09T07:20:37Z' };
  box.l = { llm: voll };
  const h = vm.runInContext('rdLlmHTML(l,"")', box);
  pruef('Herkunft ist gekennzeichnet', /KI-Kurzerklärung, automatisch erzeugt/.test(h), true);
  pruef('headline und why_now stehen drin', /Kopfzeile/.test(h) && /Begründung\./.test(h), true);
  pruef('watch_next auf drei begrenzt', (h.match(/<li>/g) || []).length, 3);
  pruef('Fließtext trägt den Zeilenlängen-Deckel', /jz-fliess/.test(h), true);
  /* NEGATIV: die Selbsteinschaetzung darf als Wort nirgends erscheinen */
  pruef('confidence steht nicht im Ausgabetext', /\blow\b|\bmedium\b|\bhigh\b/.test(h), false);
  /* NEGATIV: unvollstaendige oder fehlerhafte Bloecke entfallen GANZ */
  box.l = { llm: Object.assign({}, voll, { status: 'error' }) };
  pruef('status error ergibt keine Fläche', vm.runInContext('rdLlmHTML(l,"")', box), '');
  box.l = { llm: Object.assign({}, voll, { why_now: '   ' }) };
  pruef('leeres why_now ergibt keine Fläche', vm.runInContext('rdLlmHTML(l,"")', box), '');
  box.l = { llm: Object.assign({}, voll, { headline: '' }) };
  pruef('leere headline ergibt keine Fläche', vm.runInContext('rdLlmHTML(l,"")', box), '');
  box.l = {};
  pruef('fehlender Block ergibt keine Fläche', vm.runInContext('rdLlmHTML(l,"")', box), '');
  box.l = { llm: { status: 'ready', headline: '<script>x<\/script>', why_now: 'ok' } };
  const esc = vm.runInContext('rdLlmHTML(l,"")', box);
  pruef('Blockinhalt geescapet', /&lt;script&gt;/.test(esc) && !/<script>/.test(esc), true);
  pruef('keine URL aus dem Block im DOM', /<a /.test(esc), false);
  /* generated_at nur, wenn es vom Kartenstand abweicht */
  box.l = { llm: Object.assign({}, voll) };
  const gleich = vm.runInContext('rdLlmHTML(l,jzUhr("2026-09-09T07:20:37Z"))', box);
  pruef('gleicher Stand wird nicht wiederholt', /Text erzeugt/.test(gleich), false);
});

/* --- Teil C: Termine -------------------------------------------------------- */
gruppe('V2-3 Teil C — Terminfenster, Sortierung, keine Schätzwerte', () => {
  const heute = vm.runInContext('bstToday()', box);
  const tag = (n) => { const d = new Date(heute + 'T00:00:00'); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  box.EARN = { eintraege: [
    { date: tag(20), ticker: 'SPAET', name: 'Zu spät' },
    { date: tag(3), ticker: 'BBB', name: 'Beta', zeit: 'amc', periode: 'Q1', eps_est: 1.23, rev_est: 999 },
    { date: tag(-2), ticker: 'ALT', name: 'Vorbei' },
    { date: tag(3), ticker: 'AAA', name: 'Alpha', zeit: 'bmo', periode: 'Q2' },
    { date: tag(1), ticker: 'CCC', name: 'Gamma', zeit: 'tbd', periode: 'Q3' },
    { date: 'kaputt', ticker: 'XXX', name: 'Ungültig' }
  ] };
  const f = vm.runInContext('rdTermineFenster()', box);
  pruef('nur Tage im Fenster heute bis +14', f.map(t => t.datum), [tag(1), tag(3)]);
  pruef('gleicher Tag wird zu EINER Karte gruppiert', f[1].eintraege.length, 2);
  pruef('innerhalb des Tages alphabetisch nach Ticker', f[1].eintraege.map(e => e.ticker), ['AAA', 'BBB']);
  /* NEGATIV: Vergangenes, zu Fernes und kaputte Daten fliegen raus */
  pruef('Vergangenes fehlt', JSON.stringify(f).indexOf('Vorbei'), -1);
  pruef('Termin jenseits +14 fehlt', JSON.stringify(f).indexOf('Zu spät'), -1);
  pruef('kaputtes Datum fliegt raus', JSON.stringify(f).indexOf('Ungültig'), -1);
  /* NEGATIV: fehlender oder kaputter Feed ergibt null — die Sektion entfaellt dann */
  box.EARN = null;
  pruef('fehlender Feed ergibt null', vm.runInContext('rdTermineFenster()', box), null);
  box.EARN = { eintraege: 'kaputt' };
  pruef('strukturell falscher Feed ergibt null', vm.runInContext('rdTermineFenster()', box), null);
  box.EARN = { eintraege: [] };
  pruef('leerer Feed ergibt eine leere Liste, nicht null', vm.runInContext('rdTermineFenster().length', box), 0);
  pruef('Wochentag auf Deutsch', vm.runInContext('rdWochentag("2026-09-10")', box), 'Donnerstag');
});

/* --- Teil D: Kandidaten ----------------------------------------------------- */
gruppe('V2-3 Teil D — Kandidaten: Wortlaute, Levels-Plausibilität, kein Fib', () => {
  box.k = { rank: 1, ticker: 'AAA', name: 'Alpha', sector: 'Energy',
    setup: { readiness: 'in_zone', distance_to_zone_pct: 0 },
    rule_hits: ['weekly_uptrend', 'above_ma200'], risk_flags: ['data_partial'],
    data_quality: { status: 'partial' }, quote: { currency: 'USD' },
    levels: { entry_low: 100, entry_high: 102, stop: 96, target: 118, horizon_sessions: 30,
      fib: { anchors: { a: { date: '2026-07-01', price: 88.77 } }, levels: { '1.618': 133.44 } } } };
  const h = vm.runInContext('rdKandidatKarte(k)', box);
  pruef('die drei Level-Wortlaute stehen zeichengleich',
    ['Beobachtungszone', 'Stop-Loss (regelbasiert)', 'Kursziel (regelbasiert)'].every(w => h.includes(w)), true);
  pruef('readiness als deutscher Klartext', /in Beobachtungszone/.test(h), true);
  pruef('rule_hits und risk_flags als deutsche Chips',
    /Wochen-Aufwärtstrend/.test(h) && /über 200-Tage-Linie/.test(h) && /Daten teilweise/.test(h), true);
  pruef('Datenlage als Klartext', /Datenlage teilweise/.test(h), true);
  pruef('Zahlen mit deutschem Komma', /100,00–102,00 USD/.test(h), true);
  /* NEGATIV: levels.fib wird NICHT gerendert (Teil D.5, ADR-810) */
  pruef('kein Fib-Anker im Markup', /88,77|88\.77|133,44|133\.44|fib/i.test(h), false);
  /* NEGATIV: unplausible levels verschwinden STILL, die Karte bleibt (Teil D.3) */
  box.k.levels = { entry_low: 100, entry_high: 102, stop: 101, target: 118, horizon_sessions: 30 };
  const stopHoch = vm.runInContext('rdKandidatKarte(k)', box);
  pruef('stop >= entry_low verwirft die levels', /Stop-Loss/.test(stopHoch), false);
  pruef('die Karte selbst bleibt', /Alpha/.test(stopHoch), true);
  box.k.levels = { entry_low: 100, entry_high: 102, stop: 96, target: 101 };
  pruef('target <= entry_high verwirft die levels',
    /Kursziel/.test(vm.runInContext('rdKandidatKarte(k)', box)), false);
  box.k.levels = { entry_low: 100, entry_high: 102, stop: 96, target: Infinity };
  pruef('nicht-endlicher Wert verwirft die levels',
    /Kursziel/.test(vm.runInContext('rdKandidatKarte(k)', box)), false);
  pruef('plausible levels bestehen', vm.runInContext('rdLevelsOk({entry_low:100,entry_high:102,stop:96,target:118})', box), true);
  pruef('fehlende levels bestehen nicht', vm.runInContext('rdLevelsOk(null)', box), false);
  /* NEGATIV: unsauberer Ticker ergibt keine Karte */
  box.k.ticker = 'A A';
  pruef('unsauberer Ticker ergibt keine Karte', vm.runInContext('rdKandidatKarte(k)', box), '');
});

console.log('V2_CHECK ' + (fehler === 0 ? 'OK' : 'FEHLER') +
  ' gruppen=' + gruppen + ' faelle=' + faelle + ' fehler=' + fehler);
process.exit(fehler === 0 ? 0 : 1);
