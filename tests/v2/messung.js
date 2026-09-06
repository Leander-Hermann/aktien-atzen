/* Messskript fuer die Browserpruefung von v2.html (V2-6).
   Es misst, was nur eine echte Layout-Engine beantworten kann: gerenderte Breiten,
   Spaltenzuordnung, Sticky-Verhalten, Zeichen je Zeile und angezeigte Zahlen.

   Aufruf in der Konsole der laufenden Vorschau (tests/v2/preview.cjs):
     eval(await (await fetch('/tests/v2/messung.js')).text()); await V2MESSUNG.alles()

   Das Skript liegt versioniert im Repo und ist damit reproduzierbar; das Fahren des
   Browsers ist es nicht. Ergebnisse aus diesem Skript sind deshalb als
   Selbstpruefung zu kennzeichnen (ADR-315), nicht als deterministischer Beleg.
   Es schreibt nichts und laedt nichts nach — reine Messung. */
(function () {
  'use strict';

  const rund = (n) => Math.round(n * 100) / 100;
  const cs = (el) => getComputedStyle(el);
  const $ = (id) => document.getElementById(id);

  /* --- Flaeche ---------------------------------------------------------------- */
  function wrap() {
    const haupt = document.querySelector('main.wrap');
    const bar = document.querySelector('.appbar-inner.wrap');
    const mess = (el) => el ? {
      breite: rund(el.getBoundingClientRect().width),
      links: rund(el.getBoundingClientRect().left),
      rechts: rund(window.innerWidth - el.getBoundingClientRect().right),
      paddingLinks: cs(el).paddingLeft,
      paddingRechts: cs(el).paddingRight
    } : null;
    return {
      fenster: window.innerWidth,
      innerhalb: rund(document.documentElement.clientWidth),
      inhalt: mess(haupt),
      appbar: mess(bar)
    };
  }

  /* --- Raster ----------------------------------------------------------------- */
  function raster() {
    const jz = $('jzInhalt'), lead = $('jzLead'), kontext = $('jzKontext');
    if (!jz) return { fehler: 'jzInhalt fehlt' };
    const st = cs(jz);
    const spalten = st.gridTemplateColumns.split(/\s+/).filter(Boolean).map(x => rund(parseFloat(x)));
    const b = (el) => el ? rund(el.getBoundingClientRect().width) : null;
    const r = (el) => el ? el.getBoundingClientRect() : null;
    const rl = r(lead), rk = r(kontext);
    return {
      display: st.display,
      spaltenzahl: spalten.length,
      spaltenbreite: spalten.length ? spalten[0] : null,
      columnGap: st.columnGap,
      rowGap: st.rowGap,
      hauptspalte: b(lead),
      kontextspalte: b(kontext),
      gutter: (rl && rk) ? rund(rk.left - rl.right) : null,
      kontextStellung: kontext ? cs(kontext).position : null,
      kontextTop: kontext ? cs(kontext).top : null,
      kontextMaxHoehe: kontext ? cs(kontext).maxHeight : null,
      kontextOverflowY: kontext ? cs(kontext).overflowY : null,
      kontextDisplay: kontext ? cs(kontext).display : null
    };
  }

  /* --- Spaltenbelegung: links oder rechts, aus der gerenderten Geometrie ------- */
  function spalten() {
    const ids = ['jzLead', 'jzFolge', 'jzFokus', 'jzMarkt', 'jzMeldungen'];
    const jz = $('jzInhalt');
    if (!jz) return { fehler: 'jzInhalt fehlt' };
    /* Seitenzuordnung an der linken Kante, nicht an der Mitte: die 7er-Spalte
       reicht ueber die Mitte hinaus, eine Mittenpruefung wuerde sie „voll" nennen. */
    const jzL = jz.getBoundingClientRect().left;
    const out = {};
    ids.forEach(id => {
      const el = $(id);
      if (!el) { out[id] = 'fehlt'; return; }
      if (el.hidden) { out[id] = 'ausgeblendet'; return; }
      const re = el.getBoundingClientRect();
      out[id] = {
        seite: Math.abs(re.left - jzL) < 2 ? 'links' : 'rechts',
        links: rund(re.left), breite: rund(re.width), oben: rund(re.top + window.scrollY),
        elternteil: el.parentElement ? (el.parentElement.id || el.parentElement.className) : null
      };
    });
    const sichtbar = ids.map(id => ({ id, el: $(id) })).filter(x => x.el && !x.el.hidden);
    const nachOben = (arr) => arr.sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top).map(x => x.id);
    /* Einspaltig: eine Lesereihenfolge. Zweispaltig: je Spalte eine. */
    out.reihenfolge = nachOben(sichtbar.slice());
    out.linkeSpalte = nachOben(sichtbar.filter(x => out[x.id].seite === 'links'));
    out.rechteSpalte = nachOben(sichtbar.filter(x => out[x.id].seite === 'rechts'));
    out.zweispaltig = out.rechteSpalte.length > 0 && out.linkeSpalte.length > 0;
    out.domReihenfolge = [...$('jzInhalt').querySelectorAll('.jz-sek')].map(x => x.id)
      .filter(id => ids.includes(id));
    return out;
  }

  /* --- Ueberlauf und Touchziele ------------------------------------------------ */
  function ueberlauf() {
    const d = document.documentElement;
    const zuBreit = [...document.querySelectorAll('body *')]
      .filter(el => el.getBoundingClientRect().width > d.clientWidth + 1)
      .map(el => (el.id || el.className || el.tagName) + ' ' + rund(el.getBoundingClientRect().width));
    return {
      scrollWidth: d.scrollWidth, clientWidth: d.clientWidth,
      horizontal: d.scrollWidth > d.clientWidth,
      zuBreit: zuBreit.slice(0, 10)
    };
  }
  function touchziele() {
    const sel = 'button,a[href],input,select,[tabindex]:not([tabindex="-1"])';
    return [...document.querySelectorAll(sel)]
      .filter(el => el.offsetParent !== null)
      .map(el => ({ t: (el.id || el.className || el.tagName), h: rund(el.getBoundingClientRect().height), b: rund(el.getBoundingClientRect().width) }))
      .filter(x => x.h > 0 && (x.h < 44 || x.b < 44));
  }

  /* --- Zeichen je Zeile (Design-System § 4.1) ---------------------------------- */
  /* Es wird nicht geschaetzt: fuer jedes Zeichen wird sein Zeilenkasten bestimmt und
     nach Oberkante gruppiert. Die letzte Zeile eines Absatzes ist per Definition
     unvollstaendig und zaehlt nicht mit. */
  function zeilenEines(el) {
    const lauf = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const zeilen = new Map();
    let n;
    while ((n = lauf.nextNode())) {
      const t = n.nodeValue;
      for (let i = 0; i < t.length; i++) {
        const r = document.createRange();
        r.setStart(n, i); r.setEnd(n, i + 1);
        const box = r.getBoundingClientRect();
        if (!box.height) continue;
        const key = Math.round(box.top);
        zeilen.set(key, (zeilen.get(key) || 0) + 1);
      }
    }
    const werte = [...zeilen.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]);
    return werte;
  }
  function zeilen(selektor) {
    const sel = selektor || '.jz-fliess,.dt-abschnitt p,.modal p';
    const kandidaten = [...document.querySelectorAll(sel)]
      .filter(el => el.offsetParent !== null && el.textContent.trim().length > 120);
    if (!kandidaten.length) return { fehler: 'kein Fliesstext mit ueber 120 Zeichen sichtbar', selektor: sel };
    const laengster = kandidaten.sort((a, b) => b.textContent.length - a.textContent.length)[0];
    const alle = zeilenEines(laengster);
    const voll = alle.slice(0, -1);                       // letzte Zeile ist Rest
    return {
      selektor: sel,
      element: laengster.className || laengster.tagName,
      textlaenge: laengster.textContent.trim().length,
      maxWidthCss: cs(laengster).maxWidth,
      breitePx: rund(laengster.getBoundingClientRect().width),
      zeilen: alle,
      vollZeilen: voll,
      min: voll.length ? Math.min(...voll) : null,
      max: voll.length ? Math.max(...voll) : null,
      median: voll.length ? voll.slice().sort((a, b) => a - b)[Math.floor(voll.length / 2)] : null
    };
  }

  /* --- Container Queries ------------------------------------------------------- */
  function containertyp() {
    const traeger = [...document.querySelectorAll('body,body *')]
      .filter(el => {
        const v = cs(el).containerType;
        return v && v !== 'normal';
      })
      .map(el => ({ el: el.id || el.className || el.tagName, typ: cs(el).containerType, breite: rund(el.getBoundingClientRect().width) }));
    return {
      unterstuetzt: CSS.supports('container-type', 'inline-size'),
      traeger,
      bodyTraegt: traeger.some(x => x.el === 'BODY')
    };
  }

  /* --- Angezeigte Zahlen mit Dezimalpunkt (Teil E) ----------------------------- */
  function dezimal() {
    const lauf = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const treffer = [];
    let n;
    while ((n = lauf.nextNode())) {
      if (!n.parentElement || n.parentElement.offsetParent === null) continue;
      if (/^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) continue;
      const t = n.nodeValue;
      const m = t.match(/-?\d+\.\d+/g);
      if (m) treffer.push({ text: t.trim().slice(0, 80), zahlen: m, in: n.parentElement.className || n.parentElement.tagName });
    }
    return { anzahl: treffer.length, treffer: treffer.slice(0, 25) };
  }

  /* --- Sticky: klebt die Kontextspalte beim Scrollen? --------------------------
     Gegenprobe mit kuenstlich verlaengertem Inhalt (DoD-Zeile „Sticky"): ohne
     Verlaengerung ist die Seite kuerzer als die Spalte, dann beweist ein kurzer
     Scroll nichts. Der Fuellkasten wird nach der Messung wieder entfernt. */
  async function sticky(fuellhoehe) {
    const k = $('jzKontext'), meld = $('jzMeldungen');
    if (!k) return { fehler: 'jzKontext fehlt' };
    const h = fuellhoehe || 3000;
    const start = window.scrollY;
    const sprung = async (y) => {
      // instant, nicht smooth: html{scroll-behavior:smooth} misst sonst mitten in der Animation
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise(r => setTimeout(r, 120));   // kein rAF: steht still, wenn der Tab verborgen ist
      return rund(k.getBoundingClientRect().top);
    };
    const fuell = document.createElement('div');
    fuell.id = 'messungFueller';
    fuell.style.cssText = 'height:' + h + 'px';
    if (meld && !meld.hidden) meld.appendChild(fuell); else $('jzInhalt').appendChild(fuell);
    await new Promise(r => setTimeout(r, 60));

    const soll = parseFloat(cs(k).top || '0');
    const top0 = await sprung(0);
    const top1 = await sprung(800);
    const top2 = await sprung(2400);
    const hoehe = rund(k.getBoundingClientRect().height);
    const eigenScroll = { scrollHeight: k.scrollHeight, clientHeight: k.clientHeight, scrollbar: k.scrollHeight > k.clientHeight + 1 };
    /* Scrollt sie wirklich in sich? scrollTop setzen und zurueckmessen. */
    k.scrollTop = 400;
    const innenGescrollt = k.scrollTop;
    k.scrollTop = 0;
    /* Verlaesst sie je den Viewport nach unten? */
    const passt = hoehe <= window.innerHeight - soll + 1;

    fuell.remove();
    window.scrollTo({ top: start, behavior: 'instant' });
    await new Promise(r => setTimeout(r, 60));
    return {
      fuellhoehe: h, cssTop: cs(k).top, position: cs(k).position,
      topBei0: top0, topBei800: top1, topBei2400: top2,
      klebt: Math.abs(top1 - soll) < 2 && Math.abs(top2 - soll) < 2,
      hoehe, viewport: window.innerHeight, passtInViewport: passt,
      eigenScroll, innenGescrollt, scrolltInSich: innenGescrollt > 0
    };
  }

  async function alles() {
    return {
      stand: new Date().toISOString(),
      fenster: { breite: window.innerWidth, hoehe: window.innerHeight },
      schema: matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light',
      themeAttr: document.documentElement.getAttribute('data-theme'),
      wrap: wrap(),
      raster: raster(),
      spalten: spalten(),
      ueberlauf: ueberlauf(),
      touchzieleUnter44: touchziele(),
      zeilen: zeilen(),
      containertyp: containertyp(),
      dezimal: dezimal(),
      sticky: await sticky()
    };
  }

  window.V2MESSUNG = { wrap, raster, spalten, ueberlauf, touchziele, zeilen, containertyp, dezimal, sticky, alles };
  return 'V2MESSUNG bereit';
})();
