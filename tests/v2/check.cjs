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
  'jzKerzenOk', 'jzMoverGruppe', 'jzMoverAuswahl', 'jzZeitmarke', 'jzFett', 'jzBogenHTML', 'fp'];

/* URL gehört in die Sandbox: safeUrl prüft das Schema über new URL(...) und würde
   ohne die Klasse jede Adresse per catch verwerfen — das wäre ein Testartefakt. */
const box = { current: null, DATA: {}, MARKET: null, FGDATA: null, console, URL };
vm.createContext(box);
vm.runInContext(NAMEN.map(schneide).join('\n'), box, { filename: 'v2.html-auszug' });

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

console.log('V2_CHECK ' + (fehler === 0 ? 'OK' : 'FEHLER') +
  ' gruppen=' + gruppen + ' faelle=' + faelle + ' fehler=' + fehler);
process.exit(fehler === 0 ? 0 : 1);
