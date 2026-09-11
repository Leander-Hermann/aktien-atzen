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
  'rdLevelsOk', 'rdLevelsHTML', 'rdKandidatKarte',
  /* V2-4 Raum „Meine Werte" */
  'jzVideoHTML', 'mwMenge', 'mwGeld', 'mwKursHTML', 'mwDetailsHTML',
  'mwDerivatHTML', 'mwEreignisHTML', 'mwFremdOk', 'mwKuerzen', 'mwFremdHTML',
  'mwAuftrittTexte', 'mwAuftrittKopf', 'mwVideoHTML', 'mwSparkHTML', 'mwDetailInhaltHTML',
  'mwKarte', 'mwOhneKursHTML',
  /* V2-4 Teil D */
  'mwFormularHTML', 'mwBestandslisteHTML', 'mwCodeRender',
  /* Symbolsuche (Nutzeranweisung 10.09.) */
  'mwIndexStand', 'mwIndex', 'mwTrefferRang', 'mwSuche', 'mwHervor',
  'mwTrefferHinweis', 'mwVorschlagHTML',
  /* Symbolliste (Nutzerentscheid 11.09.) — mwSymbole traegt seinen Zustand als Eigenschaften */
  'mwSymbole', 'mwSymboleOk', 'mwListenName', 'mwWortanfang'];

/* Konstanten-Tabellen (RD_ZEIT, RD_READY …) sind keine Funktionsdeklarationen und
   werden mit demselben Verfahren geschnitten: ab `const NAME=` bis zur naechsten
   Deklaration am Zeilenanfang. */
const KONSTANTEN = ['RD_ZEIT', 'RD_READY', 'RD_REGEL', 'RD_RISIKO', 'RD_DQ', 'BST_TYP', 'MW_ALIAS',
  'MW_VERBOTEN', 'MW_TEXTDECKEL', 'BST_ART', 'BST_RICHTUNG', 'MW_SPARK_TAGE', 'MW_BOERSE_RANG'];
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
const box = { current: null, DATA: {}, MARKET: null, FGDATA: null, console, URL, j: null, TICKIDX: null, BST_POS: [],
  RADAR: null, QUOTES: null, EARN: null, CANDIDATES: null, BESTAND: null };
vm.createContext(box);
vm.runInContext(KONSTANTEN.map(schneideConst).join('\n') + '\n' +
  NAMEN.map(schneide).join('\n'), box, { filename: 'v2.html-auszug' });
/* bstSymbole liest den localStorage ueber bstLoad(); in der Sandbox gibt es keinen.
   Ersetzt wird deshalb genau diese eine Abhaengigkeit, nicht die geprueften
   Funktionen selbst — der Bestandsbezug der Terminliste wird darueber gesteuert. */
vm.runInContext('let BST_TEST=[];function bstSymbole(){return BST_TEST}', box);
/* Zustandsvariablen der Symbolsuche: sie stehen in v2.html als let auf Modulebene und
   werden hier nachgestellt, weil der Schnitt nur Funktionen uebernimmt. */
vm.runInContext('let MW_INDEX=null,MW_INDEX_STAND=0;', box);

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

/* --- V2-4 Teil B: die Positionskarte ------------------------------------------
   Gebaut werden Join-Objekte in der Form, die bstJoin() liefert; geprueft wird das
   gerenderte HTML. Jede Zusage aus Teil B.2 bis B.4 hat hier einen positiven und
   mindestens einen negativen Fall. */
function mwJoin(over) {
  return Object.assign({
    pos: { id: 'p1', symbol: 'AAA', typ: 'aktie', added_at: '2026-09-10' },
    symbol: 'AAA', name: 'Alpha AG', kurs: null, radar: null, trigger: null,
    earn: { naechster: null, letzter: null, tage: null }, auftritte: [],
    neuerAuftritt: false, kandidat: null
  }, over || {});
}
const KURS = { price: 83.1, cur: 'EUR', pct: 6.47, candles: [
  { time: 1, open: 1, high: 2, low: 0.5, close: 1.5 }, { time: 2, open: 1.5, high: 2, low: 1, close: 1.8 }], quelle: 'feed' };

gruppe('V2-4 Teil B — Positionskarte: kein Depotwert, kein Sortierwert, kein Pseudo-Trigger', () => {
  box.QUOTES = { quotes: { AAA: { price: 83.1 } } };
  box.j = mwJoin({ pos: { id: 'p1', symbol: 'AAA', typ: 'aktie', stueck: 25, einstand: 118.4, waehrung: 'USD', added_at: '2026-09-10' },
    kurs: KURS,
    trigger: { type: 'large_move', label: 'Starke Kursbewegung', value: '+6,5 %', weight: 30 },
    earn: { naechster: { date: '2026-09-14', zeit: 'amc', ticker: 'AAA' }, letzter: null, tage: 4 },
    kandidat: { ticker: 'AAA', name: 'Alpha AG' } });
  const h = vm.runInContext('mwKarte(j)', box);
  /* Seit dem Umbau vom 10.09. traegt die Karte den Ueberblick und die Detailansicht die
     Tiefe. Beide werden geprueft: was die Karte zeigen MUSS, und was sie NICHT mehr zeigt. */
  const d = vm.runInContext('mwDetailInhaltHTML(j)', box);
  pruef('Name, Symbol und Art als deutscher Klartext', /Alpha AG/.test(h) && /AAA/.test(h) && /Aktie/.test(h), true);
  pruef('Kurs mit Waehrung und deutschem Komma', /83,10 EUR/.test(h), true);
  pruef('Prozentwert mit Bezugszeitraum', /\+6,47 %/.test(h) && /· Tag/.test(h), true);
  pruef('Stueckzahl unveraendert, ohne Nachkommastellen', />25<\/span> Stück/.test(d), true);
  pruef('die Karte traegt die Stueckzahl NICHT mehr', /Stück/.test(h), false);
  pruef('Einstand mit eigener Waehrung', /Einstand <span class="num">118,40 USD/.test(d), true);
  pruef('die Karte traegt den Einstand NICHT mehr', /Einstand/.test(h), false);
  pruef('Termin als deutscher Klartext', /Zahlen am <span class="num">14\.09\.2026/.test(d) && /nach Handelsschluss/.test(d), true);
  pruef('oberster Trigger als Label-Wert-Paar', /Starke Kursbewegung/.test(h) && /\+6,5 %/.test(h), true);
  pruef('Kandidatenhinweis ohne Wertung', /Steht auch in den Beobachtungskandidaten/.test(d), true);
  /* Die Karte zeigt genau EINEN Anlass — hier den Ausloeser, weil er vorgeht. */
  pruef('die Karte zeigt nur den obersten Anlass',
    /Starke Kursbewegung/.test(h) && !/Beobachtungskandidaten/.test(h), true);
  pruef('die Karte fuehrt zur Detailansicht',
    /data-mwdetail="AAA"/.test(h) && /Details ansehen/.test(h), true);
  /* NEGATIV (Nutzerbefund 10.09.): kein verdichteter Fremdtext mehr auf der Karte. */
  pruef('die Karte traegt keinen Fremdtext mehr', /mw-fremd/.test(h), false);
  /* NEGATIV (Teil B.3): kein Depotwert, keine Verrechnung mit dem Einstand.
     25 x 118,40 = 2960; 25 x 83,10 = 2077,50; (83,10-118,40)/118,40 = -29,81 %. */
  pruef('kein Produkt aus stueck und einstand', /2\.?960/.test(h), false);
  pruef('kein Produkt aus stueck und Kurs', /2\.?077/.test(h), false);
  pruef('kein Prozentwert gegen den Einstand', /-29,8|−29,8/.test(h), false);
  pruef('keine Summenzeile', /Gesamt|Depotwert|Gesamtwert|Summe/i.test(h), false);
  /* NEGATIV (Teil B.3): der Sortierwert erscheint nirgends. Der konstruierte Radar-Score
     ergibt eine unverwechselbare Zahl — 8731 + 20 (eigene Position) = 8751. */
  box.j = mwJoin({ radar: { symbol: 'AAA', score: 8731 }, kurs: KURS });
  const sortier = vm.runInContext('mwKarte(j)', box);
  pruef('weder Score noch Sortierwert im DOM', /8731|8751/.test(sortier), false);
  pruef('das Wort Score kommt nicht vor', /score/i.test(sortier), false);
  /* NEGATIV (Teil B.3): ohne Radar-Item kein erfundener Trigger. */
  box.j = mwJoin({ kurs: KURS });
  const ohneRadar = vm.runInContext('mwKarte(j)', box);
  pruef('ohne Radar-Item keine Triggerzeile', /rd-trigger/.test(ohneRadar), false);
  pruef('ohne Termin keine Terminzeile', /Zahlen am/.test(ohneRadar), false);
  pruef('ohne Kandidateneintrag kein Hinweis', /Beobachtungskandidaten/.test(ohneRadar), false);
  /* NEGATIV (ADR-025): unsauberes Symbol ergibt gar keine Karte, Feedinhalt wird geescapet. */
  box.j = mwJoin({ symbol: 'AA<script>', pos: { id: 'p1', symbol: 'AA<script>', typ: 'aktie', added_at: '2026-09-10' } });
  pruef('unsauberes Symbol ergibt keine Karte', vm.runInContext('mwKarte(j)', box), '');
  box.j = mwJoin({ name: '<img src=x onerror=alert(1)>', kurs: KURS,
    trigger: { label: '<b>x</b>', value: '"y"' } });
  const esc = vm.runInContext('mwKarte(j)', box);
  pruef('Name geescapet', /&lt;img/.test(esc) && !/<img/.test(esc), true);
  pruef('Triggerlabel geescapet', /&lt;b&gt;x&lt;\/b&gt;/.test(esc), true);
});

gruppe('V2-4 Teil B.4 — Derivate: Naeherung gekennzeichnet, kein Optionsschein-Hochrechnen', () => {
  box.QUOTES = { quotes: { AAA: { price: 83.1 } } };
  /* Knockout long, Hebel 8,5: 6,47 % x 8,5 = 54,995 %, gerundet 54,99 % (toFixed rundet die Gleitkommazahl ab). KO bei 60: (83,10-60)/83,10 = 27,80 %. */
  box.j = mwJoin({ pos: { id: 'p1', symbol: 'AAA', typ: 'derivat', added_at: '2026-09-10',
    derivat: { art: 'knockout', richtung: 'long', hebel: 8.5, ko_schwelle: 60 } }, kurs: KURS });
  const ko = vm.runInContext('mwDetailInhaltHTML(j)', box);
  pruef('Hebelwirkung rechnerisch ausgewiesen', /Hebelwirkung rechnerisch <span class="num">\+54,99 %/.test(ko), true);
  pruef('KO-Abstand ausgewiesen', /KO-Abstand <span class="num">\+27,80 %/.test(ko), true);
  pruef('beide als idealisierte Naeherung gekennzeichnet',
    /Idealisierte Näherung[\s\S]*ohne Spread, Aufgeld, Bezugsverhältnis und Währungseffekt/.test(ko), true);
  /* Short dreht die Wirkung um und misst den KO-Abstand nach oben. */
  box.j = mwJoin({ pos: { id: 'p1', symbol: 'AAA', typ: 'derivat', added_at: '2026-09-10',
    derivat: { art: 'knockout', richtung: 'short', hebel: 8.5, ko_schwelle: 100 } }, kurs: KURS });
  const kurz = vm.runInContext('mwDetailInhaltHTML(j)', box);
  pruef('short kehrt die Hebelwirkung um', /Hebelwirkung rechnerisch <span class="num">-54,99 %/.test(kurz), true);
  pruef('short misst den KO-Abstand nach oben', /KO-Abstand <span class="num">\+20,34 %/.test(kurz), true);
  /* NEGATIV (Teil B.4, ADR-906 §3): fuer Optionsscheine wird NICHT hochgerechnet. */
  box.j = mwJoin({ pos: { id: 'p1', symbol: 'AAA', typ: 'derivat', added_at: '2026-09-10',
    derivat: { art: 'optionsschein', richtung: 'long', hebel: 8.5, ko_schwelle: 60 } }, kurs: KURS });
  const os = vm.runInContext('mwDetailInhaltHTML(j)', box);
  pruef('Optionsschein ohne Hochrechnung', /Hebelwirkung/.test(os), false);
  pruef('Optionsschein ohne den hochgerechneten Wert', /54,99 %/.test(os), false);
  pruef('Optionsschein nennt nur die Bewegung des Basiswerts',
    /Basiswert bewegt sich <span class="num">\+6,47 %/.test(os), true);
  /* NEGATIV: ohne Kurs kein KO-Abstand und keine Hebelwirkung. */
  box.j = mwJoin({ pos: { id: 'p1', symbol: 'AAA', typ: 'derivat', added_at: '2026-09-10',
    derivat: { art: 'knockout', richtung: 'long', hebel: 8.5, ko_schwelle: 60 } }, kurs: null });
  const ohneKurs = vm.runInContext('mwDetailInhaltHTML(j)', box);
  pruef('ohne Kurs keine KO-Zeile', /KO-Abstand/.test(ohneKurs), false);
  pruef('ohne Kurs keine Hebelzeile', /Hebelwirkung/.test(ohneKurs), false);
  pruef('ohne Kurs auch kein Naeherungshinweis', /Idealisierte Näherung/.test(ohneKurs), false);
  /* NEGATIV: fehlen hebel und ko_schwelle, entfaellt der Block ersatzlos. */
  box.j = mwJoin({ pos: { id: 'p1', symbol: 'AAA', typ: 'derivat', added_at: '2026-09-10',
    derivat: { art: 'knockout', richtung: 'long' } }, kurs: KURS });
  pruef('ohne hebel und ko_schwelle kein Derivatblock',
    /mw-derivat/.test(vm.runInContext('mwDetailInhaltHTML(j)', box)), false);
  pruef('der Derivatblock steht nie auf der Karte',
    /mw-derivat/.test(vm.runInContext('mwKarte(j)', box)), false);
});

gruppe('V2-4 Teile B.5 bis B.8 — Kursblock, Chartzugang, Sammelzeile, Leerzustand', () => {
  /* ADR-714 Punkt 2: der Kursblock steht in ALLEN drei Zustaenden und wird nur gefuellt. */
  box.QUOTES = null;
  box.j = mwJoin({ kurs: null });
  const laedt = vm.runInContext('mwKarte(j)', box);
  box.QUOTES = { quotes: {} };
  const leer = vm.runInContext('mwKarte(j)', box);
  box.QUOTES = { quotes: { AAA: { price: 83.1 } } };
  box.j = mwJoin({ kurs: KURS });
  const voll = vm.runInContext('mwKarte(j)', box);
  pruef('Kursblock in allen drei Zustaenden vorhanden',
    [laedt, leer, voll].map(h => /class="mw-kurs"/.test(h)), [true, true, true]);
  pruef('vor dem Eintreffen wird der Ladezustand benannt', /Kurs wird geladen/.test(laedt), true);
  pruef('nach dem Eintreffen ohne Abdeckung: ehrliche Leermeldung', /Kein Kurs im Datensatz/.test(leer), true);
  /* ADR-714 Punkt 2: der leere Block traegt dieselbe Struktur wie der gefuellte — grosse
     Zeile plus Caption — damit seine Hoehe beim Nachzug nicht springt. Geprueft wird
     deshalb die Struktur UND dass darin keine Zahl und keine Waehrung steht. */
  const kursblock = h => { const i = h.indexOf('<span class="mw-kurs">'); return i < 0 ? '' : h.slice(i, h.indexOf('</div>', i)); };
  pruef('kein erfundener Kurs im Leerfall', /[0-9]|EUR|USD/.test(kursblock(leer)), false);
  pruef('Kursblock in allen Zustaenden strukturgleich aufgebaut',
    [laedt, leer, voll].map(h => /jz-gross/.test(kursblock(h)) && /t-caption/.test(kursblock(h))),
    [true, true, true]);
  /* Seit dem Umbau vom 10.09. oeffnet der Kartenklick die DETAILANSICHT; der Chart
     haengt an seinem Knopf darin. Die Karte ist deshalb immer klickbar — ein leerer
     Dialog kann daraus nicht entstehen, weil das Detail auch ohne Kurs Inhalt hat. */
  pruef('die Karte fuehrt in jedem Zustand zur Detailansicht',
    [voll, leer, laedt].map(x => /data-mwdetail="AAA"/.test(x)), [true, true, true]);
  box.QUOTES = { quotes: {} }; box.j = mwJoin({ kurs: null });
  const dLeer = vm.runInContext('mwDetailInhaltHTML(j)', box);
  box.QUOTES = null;
  const dLaedt = vm.runInContext('mwDetailInhaltHTML(j)', box);
  box.QUOTES = { quotes: { AAA: { price: 83.1 } } }; box.j = mwJoin({ kurs: KURS });
  const dVoll = vm.runInContext('mwDetailInhaltHTML(j)', box);
  pruef('mit Kursreihe ist der Chartknopf offen', /data-mwchart="AAA"[^>]*>/.test(dVoll) &&
    !/data-mwchart="AAA" disabled/.test(dVoll), true);
  pruef('ohne Kursreihe steht der Knopf und nennt den Grund',
    /data-mwchart="AAA" disabled aria-disabled="true" title="Für diesen Wert nicht geliefert"/.test(dLeer), true);
  pruef('vor dem Eintreffen nennt der Knopf den Ladegrund',
    /disabled aria-disabled="true" title="Kursdaten werden noch geladen"/.test(dLaedt), true);
  pruef('der Chartknopf steht nicht mehr auf der Karte', /data-mwchart/.test(voll), false);
  /* Teil B.6: die Sammelzeile nennt die Zahl und die Drittanfrage VOR dem Klick. */
  const sammel = vm.runInContext('mwOhneKursHTML([{},{},{}])', box);
  pruef('Sammelzeile mit Zahl', /Für <span class="num">3<\/span> Werte liegt kein Kurs im Datensatz\./.test(sammel), true);
  pruef('Einzahl bei genau einem Wert', /<\/span> Wert liegt/.test(vm.runInContext('mwOhneKursHTML([{}])', box)), true);
  pruef('die Drittanfrage steht vor dem Klick am Knopf',
    /Kurse abrufen \(Anfrage an einen Drittdienst\)/.test(sammel), true);
  pruef('was NICHT hinausgeht, steht auch dort',
    /Stückzahl, Einstand und Derivatangaben verlassen dein Gerät nicht/.test(sammel), true);
  /* NEGATIV: ohne fehlende Kurse gibt es die Zeile gar nicht. */
  pruef('ohne fehlende Kurse keine Sammelzeile', vm.runInContext('mwOhneKursHTML([])', box), '');
});

/* --- V2-4 Teil C: Videoauftritte ---------------------------------------------- */
function mwAuftritt(over) {
  return Object.assign({
    date: '2026-09-09', video_id: 'abc123',
    url: 'https://www.youtube.com/watch?v=abc123&t=264s',
    channel: 'onvista', kategorie: 'chartanalyse',
    note: 'Der Wert gab nach.', einordnung: 'Der Titel bleibt schwankungsanfällig.',
    figures: 'Kursziel von 127 auf 140 US-Dollar angehoben'
  }, over || {});
}

gruppe('V2-4 Teil C — Videoauftritte: Zeitmarke aus dem Feed, Herkunft sichtbar, Fremdtext sicher', () => {
  box.j = mwJoin({ auftritte: [mwAuftritt()], neuerAuftritt: true });
  const h = vm.runInContext('mwVideoHTML(j)', box);
  pruef('Kanal und Datum auf der Karte', /onvista/.test(h) && /09\.09\.2026/.test(h), true);
  pruef('Deeplink mit der Zeitmarke AUS DEM FEED', /Zum Video ab 4:24/.test(h), true);
  pruef('Link geht nur nach https und mit noopener',
    /href="https:\/\/www\.youtube\.com\/watch\?v=abc123&t=264s" target="_blank" rel="noopener noreferrer"/.test(h), true);
  pruef('neuer Auftritt wird dezent markiert', /Neu seit deinem letzten Besuch/.test(h), true);
  pruef('alle drei Fremdfelder mit Herkunftsangabe',
    [/Zusammenfassung des Beitrags · onvista · maschinell verdichtet/.test(h),
     /Einordnung des Kanals · onvista · maschinell verdichtet/.test(h),
     /Im Beitrag genannte Zahlen · onvista · maschinell verdichtet/.test(h)], [true, true, true]);
  pruef('figures unkommentiert als Zitat', /Kursziel von 127 auf 140 US-Dollar angehoben/.test(h), true);
  /* NEGATIV (Teil C.3): fehlende Zeitmarke wird benannt, der Link bleibt gueltig. */
  box.j = mwJoin({ auftritte: [mwAuftritt({ url: 'https://www.youtube.com/watch?v=abc123' })] });
  const ohneMarke = vm.runInContext('mwVideoHTML(j)', box);
  pruef('ohne Zeitmarke wird das gesagt', /Zum Video \(ohne Zeitmarke\)/.test(ohneMarke), true);
  pruef('ohne Zeitmarke bleibt der Link gueltig', /href="https:\/\/www\.youtube\.com\/watch\?v=abc123"/.test(ohneMarke), true);
  pruef('keine geratene Zeitmarke', /ab 0:00|ab 0:0/.test(ohneMarke), false);
  /* NEGATIV (ADR-025): unsichere Schemata ergeben KEINEN Link. */
  box.j = mwJoin({ auftritte: [mwAuftritt({ url: 'http://www.youtube.com/watch?v=abc123&t=10s' })] });
  const unsicher = vm.runInContext('mwVideoHTML(j)', box);
  pruef('http-URL ergibt keinen Link', /<a /.test(unsicher), false);
  pruef('http-URL sagt das auch', /Kein sicherer Link vorhanden\./.test(unsicher), true);
  box.j = mwJoin({ auftritte: [mwAuftritt({ url: 'javascript:alert(1)' })] });
  const js = vm.runInContext('mwVideoHTML(j)', box);
  pruef('javascript-URL ergibt keinen Link', /<a /.test(js), false);
  pruef('javascript-URL steht nirgends im DOM', /javascript:/.test(js), false);
  /* NEGATIV (ADR-025): Markup im Fremdtext wird geescapet, nicht ausgefuehrt. */
  box.j = mwJoin({ auftritte: [mwAuftritt({ note: '<script>alert(1)</script> Text',
    channel: '<img src=x onerror=alert(1)>' })] });
  const xss = vm.runInContext('mwVideoHTML(j)', box);
  pruef('kein rohes script-Tag im DOM', /<script/i.test(xss), false);
  pruef('script-Tag geescapet', /&lt;script&gt;/.test(xss), true);
  pruef('Kanalname geescapet', /&lt;img/.test(xss) && !/<img/.test(xss), true);
  /* NEGATIV (Teil F.1 / ADR-908 Punkt 4): traegt ein Fremdfeld einen Listenbegriff,
     entfaellt GENAU DIESES FELD — Kanal, Datum und Deeplink bleiben. */
  box.j = mwJoin({ auftritte: [mwAuftritt({ note: 'Host sieht den Wert als aussichtsreichen Titel.' })] });
  const verboten = vm.runInContext('mwVideoHTML(j)', box);
  pruef('Verbotsbegriff steht nicht im DOM', /aussichtsreich/i.test(verboten), false);
  pruef('das betroffene Feld entfaellt', /Zusammenfassung des Beitrags/.test(verboten), false);
  pruef('die uebrigen Felder bleiben', /Einordnung des Kanals/.test(verboten) &&
    /Im Beitrag genannte Zahlen/.test(verboten), true);
  pruef('Kanal, Datum und Link bleiben erhalten',
    /onvista/.test(verboten) && /09\.09\.2026/.test(verboten) && /Zum Video ab 4:24/.test(verboten), true);
  pruef('mwFremdOk erkennt jeden Begriff der Liste',
    ['Top Picks', 'beste Chancen', 'Erfolgswahrscheinlichkeit', 'Kaufkandidat', 'Einstieg jetzt',
     'sichere Ziele', 'lohnt sich', 'aussichtsreich', 'dein Risiko', 'zu hoch gewichtet', 'gut gelaufen']
      .map(w => vm.runInContext('mwFremdOk("Ein Satz mit ' + w + ' darin.")', box)),
    [false, false, false, false, false, false, false, false, false, false, false]);
  pruef('ein unverfaenglicher Satz bleibt zulaessig',
    vm.runInContext('mwFremdOk("Der Umsatz stieg um 12 Prozent.")', box), true);
  /* Teil C.4: Laengendeckel nach Design-System §4.1. Der Feed liefert heute hoechstens
     200 Zeichen, der Deckel greift also nicht — geprueft wird er trotzdem, sonst waere
     er eine ungepruefte Zusage (ADR-317.5). */
  const lang = 'Wort '.repeat(80);
  pruef('langer Text wird gekuerzt', vm.runInContext('mwKuerzen("' + lang + '").length', box) <= 221, true);
  pruef('gekuerzter Text endet mit Auslassungszeichen',
    /…$/.test(vm.runInContext('mwKuerzen("' + lang + '")', box)), true);
  pruef('kurzer Text bleibt unveraendert',
    vm.runInContext('mwKuerzen("Kurzer Satz.")', box), 'Kurzer Satz.');
  /* Teil C.2 und C.6 */
  box.j = mwJoin({ auftritte: Array.from({ length: 12 }, (_, i) =>
    mwAuftritt({ date: '2026-09-' + String(9 - (i % 9) + 1).padStart(2, '0'), video_id: 'v' + i })) });
  const viele = vm.runInContext('mwVideoHTML(j)', box);
  pruef('elf weitere Auftritte hinter dem Aufklapper', /Frühere Auftritte \(11\)/.test(viele), true);
  pruef('der Aufklapper ist ein details-Element, kein zweiter Dialog',
    /<details class="mw-mehr">/.test(viele) && !/role="dialog"/.test(viele), true);
  box.j = mwJoin({ auftritte: [] });
  pruef('ohne Auftritt entfaellt die Flaeche ersatzlos', vm.runInContext('mwVideoHTML(j)', box), '');
  pruef('kein Etikett wie „bisher nicht besprochen"',
    /nicht besprochen|kein Videoauftritt/i.test(vm.runInContext('mwKarte(j)', box)), false);
});

/* --- V2-4 Teil D: Verwaltung und Datenübertragung ------------------------------
   Die schreibenden Pfade (Anlegen, Entfernen, Import) brauchen ein Dokument und sind
   im Browser belegt; hier steht, was ohne DOM prüfbar ist: der Aufbau der Formulare,
   die Wortlaute und die Zusagen, die man am Quelltext festmachen kann. */
gruppe('V2-4 Teil D — Verwaltung: Formularaufbau, Löschweg, Übertragung', () => {
  const f = vm.runInContext('mwFormularHTML()', box);
  /* Nutzeranweisung 10.09.2026: gesucht wird über den Klarnamen, gesammelt wird über
     Chips, und die Eingabetaste übernimmt. Der frühere Fall prüfte auf den Hinweis
     „Mehrere durch Komma" — das war die abgelöste Bedienung. */
  pruef('Suchfeld als Combobox mit Vorschlagsliste',
    /id="mwSym"/.test(f) && /role="combobox"/.test(f) &&
    /aria-controls="mwVorschlaege"/.test(f) && /aria-autocomplete="list"/.test(f), true);
  pruef('Chipreihe für gesammelte Werte, anfangs verborgen', /id="mwChips" hidden/.test(f), true);
  pruef('Vorschlagsliste ist eine Listbox, anfangs verborgen',
    /id="mwVorschlaege" role="listbox"[\s\S]*?hidden/.test(f), true);
  pruef('die Hilfe erklärt die Eingabetaste', /Eingabetaste übernimmt den Vorschlag/.test(f), true);
  pruef('alle fünf Arten stehen zur Wahl',
    ['aktie', 'beobachtung', 'derivat', 'etf', 'krypto'].every(k => f.indexOf('value="' + k + '"') > -1), true);
  pruef('Beobachtung ist die Vorauswahl', /value="beobachtung" selected/.test(f), true);
  pruef('optionaler Detailbereich mit stueck, einstand, waehrung',
    /id="mwStueck"/.test(f) && /id="mwEinstand"/.test(f) && /id="mwWaehrung"/.test(f), true);
  pruef('Derivatblock ist vorhanden und anfangs verborgen',
    /id="mwDerivatFelder" hidden/.test(f), true);
  pruef('Derivatfelder vollständig',
    ['mwDerArt', 'mwDerRichtung', 'mwDerHebel', 'mwDerKo', 'mwDerWkn'].every(k => f.indexOf('id="' + k + '"') > -1), true);
  pruef('Hebel und KO-Schwelle sind als Näherung gekennzeichnet',
    /idealisierte\s+Näherungen/.test(f), true);
  pruef('Meldungsfläche ist eine Statusregion', /role="status" aria-live="polite"/.test(f), true);
  pruef('jedes Feld hat ein verknüpftes Label',
    (f.match(/<label class="t-small" for="/g) || []).length >= 8, true);
  /* NEGATIV: das Formular legt nichts von selbst an und ruft keinen Dialog auf. */
  pruef('kein confirm im Formular', /confirm\(/.test(f), false);
  pruef('kein Symbol in einem href oder einer URL', /href=|\?sym|&sym/.test(f), false);

  /* Bestandsliste (Teil D.2). bstPositionen wird in der Sandbox ersetzt. */
  vm.runInContext('function bstPositionen(){return BST_POS}', box);
  box.BST_POS = [{ id: 'p1', symbol: 'SAP.DE', typ: 'beobachtung', added_at: '2026-09-10' },
    { id: 'p2', symbol: 'IFX.DE', typ: 'derivat', added_at: '2026-09-10' }];
  const l = vm.runInContext('mwBestandslisteHTML()', box);
  pruef('je Position eine Zeile mit Entfernen-Knopf',
    (l.match(/data-mwweg="/g) || []).length, 2);
  pruef('Art als deutscher Klartext', /Beobachtung/.test(l) && /Derivat/.test(l), true);
  pruef('Symbol läuft durch die Whitelist', /SAP\.DE/.test(l) && /IFX\.DE/.test(l), true);
  /* NEGATIV: leerer Bestand ergibt einen Satz, keine leere Liste. */
  box.BST_POS = [];
  const leer = vm.runInContext('mwBestandslisteHTML()', box);
  pruef('leerer Bestand: ein Satz statt einer leeren Liste',
    /Noch kein Wert angelegt/.test(leer) && !/<ul/.test(leer), true);
  /* NEGATIV: ein unsauberes Symbol wird geescapet, nicht roh ausgegeben. */
  box.BST_POS = [{ id: 'p1', symbol: '<img src=x>', typ: 'aktie', added_at: '2026-09-10' }];
  const boese = vm.runInContext('mwBestandslisteHTML()', box);
  pruef('unsauberes Symbol geescapet', /&lt;img/.test(boese) && !/<img/.test(boese), true);

  /* Datenübertragung (Teil D.4) */
  const c = vm.runInContext('mwCodeRender.toString()', box);
  pruef('Textfeld und zwei Knöpfe',
    /id="mwCodeFeld"/.test(c) && /id="mwCodeErzeugen"/.test(c) && /id="mwCodeUebernehmen"/.test(c), true);
  pruef('der Satz sagt, wofür der Code da ist',
    /anderen Gerät/.test(c) && /nirgendwohin gesendet/.test(c), true);
  /* Zusagen am Quelltext des ganzen Raums (Teil D.2 und D.5). */
  /* Kommentare fliegen raus, bevor geprueft wird: der Verwaltungsteil ERKLAERT, dass er
     ohne confirm() auskommt — eine Textsuche wuerde genau diesen Satz als Verstoss melden. */
  const ohneKommentare = s => s.split('/*').map((teil, i) =>
    i === 0 ? teil : teil.slice(teil.indexOf('*/') + 2)).join(' ')
    .split('\n').map(z => { const i = z.indexOf('//'); return i < 0 ? z : z.slice(0, i); }).join('\n');
  const mw = ohneKommentare(html.slice(html.indexOf('Teil D — Verwaltung und Datenübertragung'),
    html.indexOf('/* --- Raumeinstieg')));
  /* Die Dialogsperre gilt fuer die GANZE Datei, nicht nur fuer den Verwaltungsabschnitt:
     der Loeschweg beginnt in der Ereignisdelegation, und die steht weit darunter. Ein auf
     den Abschnitt begrenzter Scan hat genau diesen Fall am 10.09. durchgelassen. */
  const ganz = ohneKommentare(html);
  pruef('kein confirm-Dialog in der ganzen Datei', /confirm\(/.test(ganz), false);
  pruef('kein alert und kein prompt in der ganzen Datei', /\balert\(|\bprompt\(/.test(ganz), false);
  pruef('Löschen läuft über bstRemove', /bstRemove\(id\)/.test(mw), true);
  pruef('Löschen braucht einen zweiten Schritt',
    /data-mwwegja/.test(mw) && /Wirklich entfernen\?/.test(mw), true);
  pruef('Anlegen läuft über die vorhandene Prüfschicht',
    /bstNormEingabe\(/.test(mw) && /bstAdd\(/.test(mw) && /bstNextId\(/.test(mw), true);
  pruef('kein zweites Datenmodell und keine zweite Validierung',
    /localStorage\.setItem|JSON\.parse/.test(mw), false);
  pruef('die Migration wird nicht angezeigt', /bstMigrate\(|Migration übernommen/.test(mw), false);
});

/* --- Symbolsuche (Nutzeranweisung 10.09.2026) ----------------------------------
   Geprueft wird gegen einen konstruierten Feedstand, nicht gegen die Livedatei: die
   Zusage ist „findet den Wert ueber seinen Klarnamen", nicht „der Feed enthaelt heute
   zufaellig Amazon". Die drei Faelle unten sind die real gescheiterten Eingaben des
   Nutzers vom 10.09. */
gruppe('V2-4 Nachtrag — Symbolsuche: Klarname findet das Symbol, ohne neue Datenquelle', () => {
  box.TICKIDX = { ticker: {
    AMZN: { name: 'Amazon.com, Inc.', auftritte: [{ date: '2026-09-08' }, { date: '2026-09-07' }] },
    GOOGL: { name: 'Alphabet', auftritte: [{ date: '2026-09-08' }] },
    'SAP.DE': { name: 'SAP', auftritte: [{ date: '2026-09-05' }] },
    AAPL: { name: 'Apple', auftritte: [] },
    'AIR.PA': { name: 'Airbus', auftritte: [] }
  } };
  box.QUOTES = { quotes: { AMZN: { price: 1 }, GOOGL: { price: 1 } } };
  box.RADAR = null; box.EARN = null; box.CANDIDATES = null;
  vm.runInContext('MW_INDEX=null;MW_INDEX_STAND=-1', box);
  const idx = vm.runInContext('mwIndex()', box);
  pruef('Index entsteht aus den geladenen Feeds', idx.length, 5);
  pruef('Index kennt Kurslage und Auftrittszahl',
    idx.filter(e => e.symbol === 'AMZN').map(e => [e.kurs, e.auftritte])[0], [true, 2]);
  const treffer = q => vm.runInContext('mwSuche(' + JSON.stringify(q) + ',8).map(e=>e.symbol)', box);
  /* Die drei Faelle, an denen der Nutzer am 10.09. gescheitert ist. */
  pruef('„amazon" findet AMZN', treffer('amazon')[0], 'AMZN');
  pruef('„sap" findet SAP.DE', treffer('sap')[0], 'SAP.DE');
  pruef('„google" findet GOOGL', treffer('google')[0], 'GOOGL');
  pruef('„alphabet" findet GOOGL ebenfalls', treffer('alphabet')[0], 'GOOGL');
  /* Kuerzel funktionieren weiter, und exakte Gleichheit gewinnt. */
  pruef('exaktes Symbol steht oben', treffer('aapl')[0], 'AAPL');
  /* Bei gleichem Rang (beide Symbolanfang) entscheidet die Datenlage, nicht das Alphabet:
     AMZN hat zwei Auftritte, AAPL keinen. Das ist die gebaute Absicht. */
  pruef('bei gleichem Rang zaehlt die Datenlage', treffer('a').slice(0, 2), ['AMZN', 'AAPL']);
  /* NEGATIV: eine Eingabe ohne Entsprechung liefert nichts — daran haette der Nutzer
     „AHLA" als Fehlgriff erkannt, statt eine leere Karte anzulegen. */
  pruef('„AHLA" liefert keinen Treffer', treffer('AHLA'), []);
  pruef('leere Eingabe liefert keinen Treffer', treffer(''), []);
  /* Rangfolge: bei Gleichstand entscheidet die Datenlage, nicht der Zufall. */
  pruef('bei gleichem Rang steht der Wert mit mehr Auftritten oben',
    treffer('a').indexOf('AMZN') < treffer('a').indexOf('AIR.PA'), true);
  /* NEGATIV (ADR-025): die Hervorhebung baut kein Markup aus der Eingabe. */
  const boese = vm.runInContext('mwHervor("Amazon <b>x</b>","<b>")', box);
  pruef('Markup im Namen wird geescapet', /&lt;b&gt;/.test(boese) && !/<b>/.test(boese), true);
  const treffermarke = vm.runInContext('mwHervor("Amazon","ama")', box);
  pruef('der Treffer wird markiert', /<mark>Ama<\/mark>zon/.test(treffermarke), true);
  pruef('ohne Treffer keine Markierung',
    /<mark>/.test(vm.runInContext('mwHervor("Amazon","zzz")', box)), false);
  /* Der Vorschlag nennt die Datenlage, wertet sie aber nicht. */
  box.E = idx.filter(e => e.symbol === 'AMZN')[0];
  pruef('Hinweis nennt Auftritte und Kurs',
    vm.runInContext('mwTrefferHinweis(E)', box), '2 Videoauftritte · Kurs vorhanden');
  box.E = idx.filter(e => e.symbol === 'AAPL')[0];
  pruef('ohne Daten bleibt der Hinweis leer', vm.runInContext('mwTrefferHinweis(E)', box), '');
  pruef('kein Werturteil im Hinweis',
    /gut|schlecht|empfehl|chance|interessant/i.test(vm.runInContext('mwTrefferHinweis(E)', box)), false);
  /* Die Liste ist als Listbox ausgezeichnet und markiert genau einen Eintrag. */
  box.L = vm.runInContext('mwSuche("a",8)', box);
  const html = vm.runInContext('mwVorschlagHTML(L,"a",1)', box);
  pruef('jeder Vorschlag ist eine Option mit Id', (html.match(/role="option" id="mwV/g) || []).length, box.L.length);
  pruef('genau ein Eintrag ist ausgewählt', (html.match(/aria-selected="true"/g) || []).length, 1);
  pruef('leere Trefferliste ergibt kein Markup', vm.runInContext('mwVorschlagHTML([],"a",-1)', box), '');
});

/* --- Sparkline und Detailansicht (Nutzerwunsch 10.09.2026) ---------------------- */
gruppe('V2-4 Nachtrag — Sparkline zeigt Verlauf ohne Deutung, Detail traegt die Tiefe', () => {
  const kerzen = n => Array.from({ length: n }, (_, i) => ({ time: i, close: 100 + Math.sin(i / 3) * 5 }));
  box.QUOTES = { quotes: { AAA: { price: 83.1 } } };
  /* Kriterium 6: die Linie entsteht nur aus Kerzen und traegt weder Achsen noch Zahlen. */
  box.K = { price: 100, cur: 'EUR', pct: 1, candles: kerzen(120) };
  const spark = vm.runInContext('mwSparkHTML(K)', box);
  pruef('Sparkline ist ein SVG mit einer Linie', /<svg class="mw-spark"[\s\S]*<polyline /.test(spark), true);
  pruef('keine Zahl im Sparkline-Markup ausser den Koordinaten',
    /<text|aria-label|title/.test(spark), false);
  pruef('Sparkline ist fuer Screenreader ausgeblendet', /aria-hidden="true"/.test(spark), true);
  pruef('hoechstens 90 Punkte, auch bei 120 Kerzen',
    (spark.match(/,/g) || []).length <= 90, true);
  /* NEGATIV: ohne ausreichende Kerzen entfaellt sie ersatzlos statt eine Linie zu erfinden. */
  box.K = { price: 100, candles: kerzen(5) };
  pruef('zu wenige Kerzen ergeben keine Linie', vm.runInContext('mwSparkHTML(K)', box), '');
  box.K = null;
  pruef('ohne Kurs keine Linie', vm.runInContext('mwSparkHTML(K)', box), '');
  box.K = { price: 100, candles: [] };
  pruef('leere Kerzenreihe ergibt keine Linie', vm.runInContext('mwSparkHTML(K)', box), '');
  /* Kriterium 1 und 5: die Karte traegt den Ueberblick, die Fussnote steht im Detail. */
  box.j = mwJoin({ kurs: { price: 83.1, cur: 'EUR', pct: 6.47, candles: kerzen(60) },
    auftritte: [mwAuftritt(), mwAuftritt({ date: '2026-09-01', video_id: 'zwei' })] });
  const karte = vm.runInContext('mwKarte(j)', box);
  const detail = vm.runInContext('mwDetailInhaltHTML(j)', box);
  pruef('die Karte zeigt die Sparkline', /mw-spark/.test(karte), true);
  pruef('die Karte nennt den letzten Auftritt mit Kanal und Datum',
    /onvista/.test(karte) && /09\.09\.2026/.test(karte), true);
  pruef('die Karte zaehlt weitere Erwaehnungen statt sie auszubreiten',
    /und 1 weitere Erwähnung/.test(karte), true);
  pruef('die Karte traegt keine verdichteten Texte', /mw-fremd/.test(karte), false);
  pruef('das Detail traegt sie vollstaendig', (detail.match(/mw-fremd/g) || []).length, 6);
  pruef('das Detail nennt beide Auftritte', (detail.match(/mw-auftritt/g) || []).length, 2);
  /* Kriterium 5: EINE Fussnote statt drei Beschriftungen je Auftritt. */
  pruef('genau eine Fussnote im Detail', (detail.match(/mw-fussnote/g) || []).length, 1);
  pruef('die Fussnote benennt Herkunft und Verdichtung',
    /maschinell verdichtet/.test(detail) && /nicht die Auffassung dieser Seite/.test(detail), true);
  pruef('die Zuordnung steht weiterhin an jedem Auftritt',
    (detail.match(/mw-kanal/g) || []).length, 2);
  /* NEGATIV: ohne Auftritte gibt es weder Ueberschrift noch Fussnote. */
  box.j = mwJoin({ kurs: null, auftritte: [] });
  const ohne = vm.runInContext('mwDetailInhaltHTML(j)', box);
  pruef('ohne Auftritte keine Videoueberschrift', /In den Videoanalysen/.test(ohne), false);
  pruef('ohne Auftritte keine Fussnote', /mw-fussnote/.test(ohne), false);
  pruef('der Chartzugang bleibt trotzdem', /data-mwchart/.test(ohne), true);
  /* NEGATIV (ADR-025): unsauberes Symbol ergibt kein Detail. */
  box.j = mwJoin({ symbol: 'AA<script>' });
  pruef('unsauberes Symbol ergibt kein Detail', vm.runInContext('mwDetailInhaltHTML(j)', box), '');
});

/* --- Symbolliste (Nutzerentscheid 11.09.2026: US komplett plus Feeds) --------------
   Die Liste ist eine Sucheingabe-Hilfe: Sie sagt, welches Symbol gemeint ist, liefert aber
   weder Kurs noch Auftritte. Geprueft wird die AUSGELIEFERTE Datei (Schema, Umfang,
   Ausschluesse), das Fail-closed beim Laden, die Rangfolge mit der Liste und dass die
   Liste nie in der ersten Ladewelle steht (ADR-714). */
gruppe('V2-4 Nachtrag — Symbolliste: Nu Holdings wird gefunden, Feeds behalten Vorrang, Datei faellt geschlossen aus', () => {
  const datei = path.join(__dirname, '..', '..', 'stammdaten', 'symbole.json');
  pruef('stammdaten/symbole.json liegt vor', fs.existsSync(datei), true);
  const roh = JSON.parse(fs.readFileSync(datei, 'utf8'));
  box.J = roh;
  pruef('Datei besteht die Schemapruefung', vm.runInContext('mwSymboleOk(J)', box), true);
  pruef('Stand ist ein Datum', /^\d{4}-\d{2}-\d{2}$/.test(roh.stand), true);
  pruef('Quellen sind benannt (SEC und Nasdaq)',
    roh.quellen.length === 2 && /sec\.gov/.test(roh.quellen[0]) && /nasdaqtrader/.test(roh.quellen[1]), true);
  pruef('mindestens 10.000 Eintraege', roh.eintraege.length >= 10000, true);
  const nu = roh.eintraege.filter(e => e[0] === 'NU')[0];
  pruef('NU steht als Nu Holdings Ltd. an der NYSE darin', nu, ['NU', 'Nu Holdings Ltd.', 'NYSE', 'aktie']);
  pruef('Symbole folgen der Kurskonvention (BRK-B, nicht BRK.B)',
    roh.eintraege.some(e => e[0] === 'BRK-B') && !roh.eintraege.some(e => /\./.test(e[0])), true);
  pruef('kein Symbol ausserhalb des Musters',
    roh.eintraege.filter(e => !/^[A-Z]{1,5}(-[A-Z])?$/.test(e[0])).length, 0);
  pruef('keine doppelten Symbole', new Set(roh.eintraege.map(e => e[0])).size, roh.eintraege.length);
  pruef('ETFs sind gekennzeichnet', roh.eintraege.filter(e => e[3] === 'etf').length > 1000, true);
  /* NEGATIV: Gattungen, die kein Nutzer als Wert anlegt, sind draussen. */
  pruef('keine Optionsscheine, Rechte, Units, Vorzuege, Anleihen',
    roh.eintraege.filter(e => /\b(warrants?|rights?|units?|preferred|notes? due|debentures?)\b/i.test(e[1])).length, 0);
  pruef('OTC-Zweitnotierung SAPGF ist draussen, SAP (NYSE) drin',
    [roh.eintraege.some(e => e[0] === 'SAPGF'), roh.eintraege.some(e => e[0] === 'SAP')], [false, true]);
  pruef('Namen tragen keine Gattungszusaetze mehr',
    roh.eintraege.filter(e => / (Common|Ordinary) (Stock|Shares)$/.test(e[1])).length, 0);
  pruef('Namen tragen kein Markup', roh.eintraege.filter(e => /[<>]/.test(e[1])).length, 0);
  /* NEGATIV: Nasdaq-Optionsscheine (fuenfter Buchstabe W/R/U zum Stammsymbol) kommen auch
     ueber die SEC-Liste nicht unter dem Firmennamen zurueck — NUAIW war der Fund vom 11.09. */
  const symbole = new Set(roh.eintraege.map(e => e[0]));
  pruef('keine Optionsscheine/Units/Rechte zu vorhandenen Stammsymbolen',
    roh.eintraege.filter(e => /^[A-Z]{4}[WRU]$/.test(e[0]) && symbole.has(e[0].slice(0, 4))).length, 0);
  pruef('NUAIW ist draussen, NUAI drin', [symbole.has('NUAIW'), symbole.has('NUAI')], [false, true]);

  /* NEGATIV: Fail-closed beim Laden — jede Abweichung vom Schema verwirft die Datei. */
  const ok = j => { box.J = j; return vm.runInContext('mwSymboleOk(J)', box); };
  pruef('ohne Stand verworfen', ok({ eintraege: [['NU', 'Nu', 'NYSE', 'aktie']] }), false);
  pruef('leere Liste verworfen', ok({ stand: '2026-09-11', eintraege: [] }), false);
  pruef('Eintrag mit Markup im Symbol verworfen', ok({ stand: '2026-09-11', eintraege: [['<b>', 'x', 'NYSE', 'aktie']] }), false);
  pruef('Eintrag mit kleingeschriebenem Symbol verworfen', ok({ stand: '2026-09-11', eintraege: [['nu', 'x', 'NYSE', 'aktie']] }), false);
  pruef('unbekannte Gattung verworfen', ok({ stand: '2026-09-11', eintraege: [['NU', 'x', 'NYSE', 'option']] }), false);
  pruef('kein Objekt verworfen', ok([['NU', 'x', 'NYSE', 'aktie']]), false);
  pruef('sauberer Eintrag angenommen', ok({ stand: '2026-09-11', eintraege: [['NU', 'x', 'NYSE', 'aktie']] }), true);

  /* Rangfolge mit einer kleinen Liste neben den Feeds. */
  box.TICKIDX = { ticker: {
    AMZN: { name: 'Amazon.com, Inc.', auftritte: [{ date: '2026-09-08' }, { date: '2026-09-07' }] },
    'SAP.DE': { name: 'SAP', auftritte: [{ date: '2026-09-05' }] }
  } };
  box.QUOTES = { quotes: { AMZN: { price: 1 } } };
  box.RADAR = null; box.EARN = null; box.CANDIDATES = null;
  const liste = [['AMZN', 'Amazon.com, Inc.', 'Nasdaq', 'aktie'], ['NU', 'Nu Holdings Ltd.', 'NYSE', 'aktie'],
    ['NUE', 'Nucor Corporation', 'NYSE', 'aktie'], ['NUX', 'Nux Corp', 'NYSE Arca', 'aktie'],
    ['NUO', 'Nuo Inc', 'OTC', 'aktie'], ['NUSI', 'Nationwide Nasdaq-100 Income ETF', 'Nasdaq', 'etf'],
    ['SAP', 'SAP SE', 'NYSE', 'aktie']];
  const setzen = l => { box.L = l; vm.runInContext(
    'MW_INDEX=null;MW_INDEX_STAND=-1;mwSymbole.liste=L;mwSymbole.stand=L?2:0;' +
    'mwSymbole.map=L?Object.fromEntries(L.map(e=>[e[0],e])):null', box); };
  const treffer = q => vm.runInContext('mwSuche(' + JSON.stringify(q) + ',8).map(e=>e.symbol)', box);
  /* NEGATIV zuerst: ohne Liste gibt es Nu Holdings nicht — die Liste ist die Quelle. */
  setzen(null);
  pruef('ohne Liste findet „nu holdings" nichts', treffer('nu holdings'), []);
  const standOhne = vm.runInContext('mwIndexStand()', box);
  setzen(liste);
  pruef('Indexzustand aendert sich mit der Liste', vm.runInContext('mwIndexStand()', box) - standOhne, 32);
  pruef('„nu holdings" findet NU', treffer('nu holdings')[0], 'NU');
  pruef('„nu" reiht exakt, dann Aktien nach Boersenrang, dann ETF',
    treffer('nu').slice(0, 5), ['NU', 'NUE', 'NUX', 'NUO', 'NUSI']);
  pruef('„sap": Feed-Notierung mit Auftritten steht vor der Listen-Zweitnotierung', treffer('sap'), ['SAP.DE', 'SAP']);
  pruef('„amazon" bleibt AMZN, Feedname behaelt Vorrang',
    vm.runInContext('mwSuche("amazon",8).map(e=>e.symbol+"|"+e.name)', box)[0], 'AMZN|Amazon.com, Inc.');
  pruef('Listenname ist abrufbar, Unbekanntes bleibt leer',
    [vm.runInContext('mwListenName("NU")', box), vm.runInContext('mwListenName("ZZZZ")', box)], ['Nu Holdings Ltd.', '']);
  /* Der Hinweis nennt Boerse und Gattung vor der Datenlage — und wertet nicht. */
  const hinweis = s => vm.runInContext('mwTrefferHinweis(mwIndex().filter(e=>e.symbol===' + JSON.stringify(s) + ')[0])', box);
  pruef('Hinweis fuer Listeneintrag nennt die Boerse', hinweis('NU'), 'NYSE');
  pruef('Hinweis fuer ETF nennt die Gattung', hinweis('NUSI'), 'Nasdaq · ETF');
  pruef('Hinweis fuer Feedeintrag stellt die Boerse voran', hinweis('AMZN'), 'Nasdaq · 2 Videoauftritte · Kurs vorhanden');
  pruef('Hinweis fuer reinen Feedeintrag bleibt wie bisher', hinweis('SAP.DE'), '1 Videoauftritt');

  /* Die echte Liste: die Eingaben, um die es dem Nutzer ging, in der Sandbox gegen alle 13.000. */
  setzen(roh.eintraege);
  const t0 = Date.now();
  pruef('echte Liste: „nu holding" findet NU', treffer('nu holding')[0], 'NU');
  pruef('echte Liste: „nvidia" findet NVDA', treffer('nvidia')[0], 'NVDA');
  pruef('echte Liste: „berkshire" findet beide Gattungen', treffer('berkshire').slice(0, 2).sort(), ['BRK-A', 'BRK-B']);
  pruef('echte Liste: „sap" haelt SAP.DE oben', treffer('sap')[0], 'SAP.DE');
  pruef('echte Liste: „AHLA" liefert weiter nichts', treffer('AHLA'), []);
  pruef('fuenf Suchen ueber die volle Liste unter zwei Sekunden', Date.now() - t0 < 2000, true);
  setzen(null);

  /* Ladeweg: ausserhalb von data/, nie in der ersten Welle, mit Fokus angefordert. */
  pruef('die Liste wird genau einmal und ausserhalb von data/ geladen',
    (html.match(/fetch\('stammdaten\/symbole\.json'/g) || []).length, 1);
  /* Die Wellenfunktionen sind async — schneide() kennt nur „function name(" — deshalb der Ausschnitt von Hand. */
  const welle = name => { const a = html.indexOf('async function ' + name + '('); const b = html.indexOf('\n}', a); return a < 0 ? '' : html.slice(a, b); };
  pruef('feedsKlein laedt die Liste NICHT (ADR-714)', welle('feedsKlein').length > 100 && !/symbole/i.test(welle('feedsKlein')), true);
  pruef('feedsGross holt sie nur bei Bedarf und wartet darauf', /await mwSymboleBeiBedarf\(\)/.test(welle('feedsGross')), true);
  pruef('das Suchfeld fordert sie beim Fokus an', /addEventListener\('focus',\(\)=>\{mwSymboleLaden\(\)\}\)/.test(html), true);
  pruef('der Join kennt die Liste als LETZTE Namensquelle',
    /\(ka&&ka\.name\)\|\|mwListenName\(sym\)\|\|''/.test(schneide('bstJoin')), true);
});

console.log('V2_CHECK ' + (fehler === 0 ? 'OK' : 'FEHLER') +
  ' gruppen=' + gruppen + ' faelle=' + faelle + ' fehler=' + fehler);
process.exit(fehler === 0 ? 0 : 1);
