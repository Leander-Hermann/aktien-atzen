/* Aufruf: node tests/v2-gpt/check.cjs
   Benötigt Playwright und Chrome/Chromium, siehe README.md. Frische Browserkontexte. */
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium}=require('playwright');
const {feeds,position,candles,today}=require('./fixtures.cjs');
const root=path.resolve(__dirname,'../..'),out=process.env.GPT_TEST_OUTPUT||path.join(os.tmpdir(),'aktien-atzen-v2-gpt-tests');
fs.mkdirSync(out,{recursive:true});
const passed=[],metrics={pageErrors:0,consoleErrors:0,cspViolations:0,startProxyRequests:0,expectedTransportErrors:0};
let browser,server,base,chartSource;
function check(name,fn){return Promise.resolve().then(fn).then(()=>{passed.push(name);console.log('PASS '+name)})}
function block(s,name,next){return s.slice(s.indexOf('function '+name+'('),s.indexOf('function '+next+'('))}
function chartLib(){return fetch('https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js').then(r=>{if(!r.ok)throw Error('Chart CDN '+r.status);return r.text()})}
async function fresh({data=feeds(),positions=[],missingLib=false,slow=[],fault={},wait=true,viewportWidth=1280,theme='dark'}={}){
  const context=await browser.newContext({viewport:{width:viewportWidth,height:1000},colorScheme:theme,timezoneId:'Europe/Berlin'});
  const page=await context.newPage(),errors=[],consoleErrors=[],csp=[],requests=[],gates={};
  await page.clock.install({time:new Date(today+'T10:00:00+02:00')});
  await page.addInitScript(({positions})=>{localStorage.setItem('aa-bestand',JSON.stringify({schema:1,positionen:positions}));localStorage.setItem('aa-bestand-mig','1');localStorage.setItem('aa-bestand-besuch','2026-09-03');window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective));},{positions});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});page.on('request',r=>requests.push(r.url()));
  await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url.includes('cdn.jsdelivr.net'))return route.fulfill({contentType:'application/javascript',body:missingLib?'':chartSource});
    if(/gc\.zgo\.at|goatcounter/.test(url))return route.fulfill({contentType:'application/javascript',body:''});
    if(/api\.allorigins\.win|corsproxy\.io|query1\.finance/.test(url))return route.fulfill({contentType:'application/json',body:'{}'});
    if(url.includes('/data/')){
      if(data===null)return route.continue();
      const file=new URL(url).pathname.split('/').pop();
      if(slow.includes(file))await new Promise(resolve=>gates[file]=resolve);
      if(fault[file]==='404')return route.fulfill({status:404,body:''});
      if(fault[file]==='json')return route.fulfill({contentType:'application/json',body:'{bad'});
      if(fault[file]==='structure')return route.fulfill({contentType:'application/json',body:'{"topics":"broken","quotes":[],"items":42,"indices":null,"eintraege":{},"ticker":[]}' });
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data[file]??null)});
    }
    if(url.startsWith(base))return route.continue();
    return route.fulfill({status:200,body:''});
  });
  await page.goto(base+'/v2-gpt.html');
  if(wait)await page.waitForFunction(()=>NOW_GROSS_DONE);
  return {page,context,requests,errors,consoleErrors,gates,async close({allow404=false,allowProxy=false}={}){
    const violations=await page.evaluate(()=>window.__csp);assert.deepEqual(errors,[],'page errors');assert.deepEqual(violations,[],'CSP');
    const unexpected=consoleErrors.filter(e=>!(allow404&&e.includes('404')));assert.deepEqual(unexpected,[],'console errors');
    metrics.expectedTransportErrors+=consoleErrors.length-unexpected.length;
    if(!allowProxy)assert.equal(requests.filter(u=>/allorigins|corsproxy|query1\.finance/.test(u)).length,0,'no proxy request');
    metrics.pageErrors+=errors.length;metrics.consoleErrors+=unexpected.length;metrics.cspViolations+=violations.length;await context.close();
  }};
}
async function main(){
  const source=fs.readFileSync(path.join(root,'v2-gpt.html'),'utf8'),v1=fs.readFileSync(path.join(root,'index.html'),'utf8'),v2=fs.readFileSync(path.join(root,'v2.html'),'utf8');
  await check('Stockkern zeichengleich, CSP unverändert, keine Zufallskerzen',()=>{
    assert.equal(block(source,'openStock','buildStk'),block(v1,'openStock','buildStk'));
    const build=s=>s.match(/function buildStk\(days\)\{[^\r\n]+/)[0];assert.equal(build(source),build(v1));
    assert.equal(source.match(/function bstHatEreignis[^\r\n]+/)[0],v1.match(/function bstHatEreignis[^\r\n]+/)[0]);
    assert.equal(source.slice(source.indexOf("const WLKEY="),source.indexOf('/* ===== GPT')).trim(),v2.slice(v2.indexOf("const WLKEY="),v2.indexOf('/* ===== Start')).trim(),'Bestandsmodell und Joins unverändert');
    for(const name of ['escapeHtml','safeUrl','safeLink'])assert.equal(source.match(new RegExp('function '+name+'[^\\r\\n]+'))[0],v2.match(new RegExp('function '+name+'[^\\r\\n]+'))[0]);
    assert.equal(source.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0],v2.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0]);
    assert(!/candlesGen|Math\.random\(/.test(source));assert(!/mvPrefetch\(\);/.test(source));
  });
  chartSource=process.env.CHART_LIBRARY_FILE?fs.readFileSync(process.env.CHART_LIBRARY_FILE,'utf8'):await chartLib();
  fs.writeFileSync(path.join(out,'lightweight-charts-4.1.3.js'),chartSource);
  server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.woff2')?'font/woff2':'application/octet-stream');res.end(b)})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  const executablePath=process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
  browser=await chromium.launch({headless:true,executablePath});
  await check('Start, Digest-Priorität/Gleichstand, Quellenstände, Original unverändert',async()=>{
    const f=await fresh(),{page}=f;
    assert.match(await page.title(),/GPT/);assert.match(await page.locator('#h-jetzt').innerText(),/GPT/);
    assert.deepEqual(await page.locator('[data-topic]').evaluateAll(es=>es.map(e=>e.dataset.topic)),['0','1','2','3','4','5']);
    assert.equal(await page.locator('.digest-lead h3').innerText(),'Erste wichtige Nachricht');
    assert.deepEqual(await page.evaluate(()=>NOW_TOPICS.map(t=>t.title)),['Erste wichtige Nachricht','Zweite wichtige Nachricht','Mittlere Nachricht','Niedrige Nachricht','Ungültige Priorität','Priorität als Text']);
    assert.deepEqual(await page.evaluate(()=>DATA[current].topics.map(t=>t.prio)),[1,3,2,3,9,'3',3]);
    assert.match(await page.locator('#marktStand').innerText(),/04.09.2026/);assert.match(await page.locator('.digest-meta').innerText(),/05.09.2026/);
    assert(!f.requests.some(u=>u.endsWith('/2026-09-06.json')));await f.close();
  });
  await check('Digest-Grenzen 0/1/2 und invalides Indexdatum',async()=>{
    const f=await fresh();for(const n of [0,1,2]){await f.page.evaluate(n=>{DATA[current].topics=[{title:'A',prio:1},{title:'B',prio:2}].slice(0,n);renderDigest()},n);assert.equal(await f.page.locator('[data-topic]').count(),n);}
    assert.equal(await f.page.evaluate(()=>nowISO('2026-02-31')),false);await f.close();
  });
  await check('Volltext, XSS, Links, Bildfehler und Dialogtastatur',async()=>{
    const data=feeds();Object.assign(data['2026-09-05.json'].topics[1],{img:'https://example.com/broken.png',body:'<img src=x onerror="window.HACK=1"> **fett** <script>window.HACK=1</script>',sources:[{l:'HTTPS',u:'https://example.com/?a=1&b=2'},{l:'JS',u:'javascript:alert(1)'},{l:'HTTP',u:'http://example.com'},{l:'Kaputt',u:'garbage'}],begriffe:[{term:'<svg onload=alert(1)>',erklaerung:'**Begriff** <b>Text</b>'}]});
    const f=await fresh({data}),p=f.page;await p.locator('[data-topic="0"]').click();
    assert.equal(await p.locator('#articleOverlay').evaluate(e=>e.open),true);assert.equal(await p.evaluate(()=>document.activeElement.id),'articleTitle');assert.equal(await p.locator('#app').evaluate(e=>e.inert),true);
    assert.equal(await p.locator('#articleBody script,#articleBody svg').count(),0);assert.equal(await p.evaluate(()=>window.HACK),undefined);assert.match(await p.locator('#articleBody').innerText(),/<img/);
    assert.equal(await p.locator('#articleBody strong').count(),2);assert.equal(await p.locator('#articleBody a').count(),1);assert.equal(await p.locator('#articleBody a').getAttribute('href'),'https://example.com/?a=1&b=2');
    for(const text of ['Zeitlicher Bezug','Verlauf','Einordnung','Begriffe','Quellen'])assert.match(await p.locator('#articleBody').innerText(),new RegExp(text));
    await p.locator('#articleBody img').evaluateAll(es=>es.forEach(e=>e.dispatchEvent(new Event('error'))));assert.equal(await p.locator('#articleBody img').count(),0);
    await p.keyboard.press('Shift+Tab');assert.equal(await p.evaluate(()=>document.activeElement.tagName),'A');await p.keyboard.press('Tab');assert.equal(await p.locator('#articleOverlay [data-close]').evaluate(e=>e===document.activeElement),true);
    await p.keyboard.press('Escape');assert.equal(await p.locator('#articleOverlay').evaluate(e=>e.open),false);assert.equal(await p.evaluate(()=>document.activeElement.dataset.focusKey),'topic-0');await f.close();
  });
  await check('Fokus: Ereignisse, Typen, Tageskurse und neuestes Video',async()=>{
    const f=await fresh({positions:[position('p1','AA','aktie'),position('p2','AA','derivat'),position('p3','BB'),position('p4','CC')]}),p=f.page;
    assert.equal(await p.locator('[data-position]').count(),3);assert.equal(await p.locator('[data-position="p1"]').count(),1);assert.equal(await p.locator('[data-position="p2"]').count(),1);
    assert.equal(await p.evaluate(()=>bstHatEreignis(bstJoin(bstById('p4')))),false);assert.equal(await p.evaluate(()=>bstJoin(bstById('p3')).earn.tage),2);
    const text=await p.locator('#fokusBody').innerText();assert.match(text,/Kursbewegung · \+4 %/);assert.match(text,/06.09.2026/);assert.match(text,/08.09.2026/);assert.match(text,/Neuer Videoauftritt/);assert.match(text,/03.09.2026/);assert(!text.includes('999'));assert(!text.includes('Alter Kanal'));
    assert.equal(await p.locator('[data-position="p1"] a').getAttribute('href'),'https://www.youtube.com/watch?v=latest&t=196s');assert.match(await p.locator('[data-position="p3"] a').innerText(),/ohne Zeitmarke/);
    assert.match(text,/1.85 %/);assert.match(text,/0 EUR/);assert.equal(await p.evaluate(()=>BST_LETZTER_BESUCH),'2026-09-03');await f.close();
  });
  await check('Onboarding: nur Klick, Normalisierung, Duplikatprüfung',async()=>{
    const f=await fresh(),p=f.page;assert.match(await p.locator('#fokusBody').innerText(),/Formatbeispiele, keine Empfehlung/);assert.equal(await p.evaluate(()=>bstPositionen().length),0);
    assert.deepEqual(await p.locator('[data-add]').evaluateAll(es=>es.map(e=>e.dataset.add)),['AAPL','SAP.DE','^GDAXI']);
    await p.locator('[data-add="^GDAXI"]').click();await p.evaluate(()=>nowAdd('^gdaxi'));assert.equal(await p.evaluate(()=>bstPositionen().length),1);assert.equal(await p.evaluate(()=>bstPositionen()[0].symbol),'^GDAXI');assert.equal(await p.evaluate(()=>document.activeElement.id),'fokusTitel');await f.close();
  });
  await check('Langsame Großfeeds ergänzen Fokus ohne Dialog-/Aufklapperverlust',async()=>{
    const f=await fresh({positions:[position('p1','AA')],slow:['radar.json','quotes.json','ticker-index.json'],wait:false}),p=f.page;
    await p.locator('#indicesToggle').click();await p.locator('[data-topic="0"]').click();
    await p.waitForFunction(()=>document.getElementById('articleOverlay').open);
    for(const name of ['radar.json','quotes.json','ticker-index.json']){while(!f.gates[name])await new Promise(r=>setTimeout(r,5));f.gates[name]()}
    await p.waitForFunction(()=>NOW_GROSS_DONE);assert.equal(await p.locator('#articleOverlay').evaluate(e=>e.open),true);assert.equal(await p.evaluate(()=>document.activeElement.id),'articleTitle');assert.equal(await p.locator('#allIndices').isVisible(),true);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.activeElement.dataset.topic),'0');await f.close();
    const g=await fresh({positions:[position('p1','AA')],slow:['quotes.json'],wait:false});await g.page.locator('[data-stock="AA"]').focus();while(!g.gates['quotes.json'])await new Promise(r=>setTimeout(r,5));g.gates['quotes.json']();await g.page.waitForFunction(()=>NOW_GROSS_DONE);assert.equal(await g.page.evaluate(()=>document.activeElement.dataset.focusKey),'stock-p1');await g.close();
  });
  await check('Ereignis-Leerstände und unsicherer Videolink',async()=>{
    const f=await fresh({positions:[position('p1','CC')]}),p=f.page;assert.match(await p.locator('#fokusBody').innerText(),/Keine passenden Ereignisse/);assert.equal(await p.locator('#fokusBody a').count(),0);await f.close();
    const g=await fresh({positions:[position('p1','AA')],fault:{'radar.json':'structure','earnings.json':'structure','ticker-index.json':'structure'}});assert.match(await g.page.locator('#fokusBody').innerText(),/Keine Ereignisdaten verfügbar/);await g.close();
  });
  await check('Fear & Greed 0/100/null/String/Ausreißer und Indexmengen',async()=>{
    const f=await fresh(),p=f.page;for(const score of [0,100,null,'42',-1,101]){await p.evaluate(score=>{MARKET.feargreed={score,rating:'Test'};renderMarkt()},score);assert.equal(await p.locator('.fg-arc').count(),typeof score==='number'&&score>=0&&score<=100?1:0);assert.equal(await p.locator('#indicesToggle').count(),1)}
    for(const n of [6,20,2,0]){await p.evaluate(n=>{const template=NOW_INDICES[0]||{nm:'DAX',val:'1.234,56',pct:0};MARKET.indices=Array.from({length:n},(_,i)=>({...template,nm:i?'Index '+i:'DAX'}));renderMarkt()},n);assert.equal(await p.locator('#allIndices .index-row').count(),n);if(n){assert.equal(await p.locator('#allIndices').isVisible(),false);await p.locator('#indicesToggle').click();assert.equal(await p.locator('#allIndices').isVisible(),true)}}await f.close();
  });
  await check('Mover Top5 stabil, vollständig aufklappbar, Nullwert und leere Gruppen',async()=>{
    const f=await fresh(),p=f.page;assert.deepEqual(await p.evaluate(()=>NOW_MOVERS.compact.map(m=>m.t)),['AA','CC','BB','DD','EE']);assert.equal(await p.locator('.mover-row').count(),5);
    await p.locator('#moversToggle').click();assert.equal(await p.locator('.mover-row').count(),9);await p.locator('#moversToggle').click();assert.equal(await p.locator('.mover-row').count(),5);assert.equal(await p.evaluate(()=>document.activeElement.id),'moversToggle');
    await p.evaluate(()=>{MARKET.gainers=[];MARKET.losers=[];MARKET.actives=[{t:'ZERO',n:'Null',p:0}];renderMarkt()});assert.equal(await p.locator('.mover-row').count(),1);assert.match(await p.locator('.mover-row').innerText(),/0.00 %/);assert.equal(await p.locator('#moversToggle').count(),0);
    await p.evaluate(()=>{MARKET.actives=[];renderMarkt()});assert.equal(await p.locator('.mover-row').count(),0);await f.close();
  });
  await check('Chart-Validierung und Tagesmove: negative Gegenproben',async()=>{
    const f=await fresh(),p=f.page;assert.equal(await p.evaluate(rows=>nowCandles(rows).length,candles()),6);
    const invalid=[null,[null],[{...candles()[0],time:'bad'}],[{...candles()[0],close:null}],[{...candles()[0],high:1}],candles().reverse(),[candles()[0],candles()[0]]];
    for(const c of invalid)assert.equal(await p.evaluate(c=>nowCandles(c).length,c),0);
    assert.equal(await p.evaluate(()=>nowDayMove([{time:1,close:100},{time:2,close:null}])),null);
    assert.equal(await p.evaluate(()=>nowDayMove([{time:1,close:100},{time:2,close:110},{time:3,close:null}])),10);
    assert.equal(await p.evaluate(()=>nowDayMove([{time:1,close:0},{time:2,close:100}])),null);await f.close();
  });
  await check('Reale Stock-/Indexcharts, Intervalle, Presets, Theme, Resize, Abbau',async()=>{
    const f=await fresh({positions:[position('p1','AA')]}),p=f.page;await p.locator('[data-stock="AA"]').click();await p.waitForFunction(()=>!!stkChart);assert.equal(await p.locator('#stklw canvas').count()>0,true);
    assert.deepEqual(await p.evaluate(()=>stkIx.candles.d1),candles());
    for(const d of ['30','180','0']){await p.locator('#stkseg [data-d="'+d+'"]').click();assert.equal(await p.evaluate(()=>!!stkChart),true)}
    await p.evaluate(()=>themeSetzen('light'));await p.setViewportSize({width:375,height:900});await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>stkChart),null);assert.equal(await p.locator('[data-stock="AA"]').evaluate(e=>e===document.activeElement),true);
    await p.locator('#indicesToggle').click();await p.locator('[data-index="0"]').click();await p.waitForFunction(()=>!!NOW_INDEX_CHART);assert.equal(await p.locator('#indexIntervals [data-res="m15"]').isDisabled(),true);
    for(const d of ['1','7','30','365','1825'])await p.locator('#indexPresets [data-days="'+d+'"]').click();await p.locator('#indexIntervals [data-res="h1"]').click();
    await p.evaluate(()=>{NOW_INDEX_CHART.timeScale().setVisibleLogicalRange({from:-50,to:50});themeSetzen('dark')});assert.equal(await p.evaluate(()=>NOW_INDEX_RES),'h1');assert.equal(await p.locator('#indexStatus').innerText(),'');await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>NOW_INDEX_CHART),null);await f.close();
  });
  await check('Chartfehler: Bibliothek fehlt, Proxy leer, rasches Schließen',async()=>{
    const f=await fresh({missingLib:true});await f.page.locator('[data-mover="0"]').click();assert.match(await f.page.locator('#stkStatus').innerText(),/Chartbibliothek nicht verfügbar/);await f.page.keyboard.press('Escape');await f.page.locator('#indicesToggle').click();await f.page.locator('[data-index="0"]').click();assert.match(await f.page.locator('#indexStatus').innerText(),/Chartbibliothek nicht verfügbar/);await f.page.keyboard.press('Escape');await f.close();
    const g=await fresh();await g.page.locator('[data-mover="1"]').click();await g.page.waitForFunction(()=>document.getElementById('stkStatus').textContent==='Keine Chartdaten verfügbar.');assert.equal(g.requests.filter(u=>/allorigins|corsproxy/.test(u)).length,2);assert(g.requests.filter(u=>/allorigins|corsproxy/.test(u)).every(u=>decodeURIComponent(u).includes('/CC?')));await g.page.keyboard.press('Escape');
    await g.page.evaluate(()=>{const b=document.querySelector('[data-mover="0"]');nowOpenStock(NOW_VISIBLE_MOVERS[0],b);nowCloseDialog()});await g.page.clock.runFor(100);assert.equal(await g.page.evaluate(()=>stkChart),null);await g.close({allowProxy:true});
  });
  await check('Defekte OHLC-Feeds: Chartfallback und gültige Kerzen ohne Quote-Preis',async()=>{
    const data=feeds();data['quotes.json'].quotes.AA.price=null;
    const f=await fresh({data,positions:[position('p1','AA')]}),p=f.page;await p.locator('[data-stock="AA"]').click();await p.waitForFunction(()=>!!stkChart);assert.equal(await p.evaluate(()=>stkIx.candles.d1.length),6);await p.keyboard.press('Escape');await f.close();
    const broken=feeds();broken['market.json'].gainers[0].candles.d1[1].time=broken['market.json'].gainers[0].candles.d1[0].time;broken['quotes.json'].quotes.AA.candles=[null];
    const g=await fresh({data:broken});await g.page.locator('[data-mover="0"]').click();await g.page.waitForFunction(()=>document.getElementById('stkStatus').textContent==='Keine Chartdaten verfügbar.');assert.equal(await g.page.evaluate(()=>stkChart),null);await g.close({allowProxy:true});
  });
  for(const file of ['index.json','2026-09-05.json','market.json','earnings.json','candidates.json','radar.json','quotes.json','ticker-index.json','videos.json','videos-index.json','ideas.json','earnings-recap.json']){
    for(const mode of ['404','json','structure'])await check('Feedausfall '+file+' '+mode,async()=>{
      const f=await fresh({positions:[position('p1','AA')],fault:{[file]:mode}}),p=f.page;
      assert.equal(await p.locator('#fokusBody').isVisible(),true);if(!['index.json','2026-09-05.json'].includes(file))assert.equal(await p.locator('.digest-lead').count(),1);if(file!=='market.json')assert.equal(await p.locator('#marktBody .fg-arc').count(),1);
      await p.evaluate(()=>raumZeigen('recherche'));assert.equal(await p.locator('#raum-recherche').isVisible(),true);await p.evaluate(()=>raumZeigen('jetzt'));await f.close({allow404:mode==='404'});
    });
  }
  await check('320/375/1280 dark/light, Touchziele, Tabular, Navigation, Screenshots',async()=>{
    const f=await fresh({positions:[position('p1','AA'),position('p2','BB'),position('p3','CC')]}),p=f.page;
    for(const width of [320,375,1280])for(const theme of ['dark','light']){
      await p.setViewportSize({width,height:1000});await p.evaluate(theme=>themeSetzen(theme),theme);
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+width);
      const small=await p.locator('button:visible,a:visible,input:visible').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width<43.9||r.height<43.9}).map(e=>({text:e.textContent,id:e.id,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));assert.deepEqual(small,[],'touch targets '+width);
      assert.equal(await p.locator('.num').first().evaluate(e=>getComputedStyle(e).fontVariantNumeric),'tabular-nums');
      await p.screenshot({path:path.join(out,`jetzt-${width}-${theme}.png`),fullPage:true,animations:'disabled'});
      await p.locator('[data-topic="0"]').click();assert(await p.locator('#articleOverlay').evaluate(e=>e.scrollWidth<=e.clientWidth));await p.keyboard.press('Escape');
      await p.locator('#indicesToggle').click();await p.locator('#moversToggle').click();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'expanded overflow '+width);
      await p.locator('#indicesToggle').click();await p.locator('#moversToggle').click();
    }
    for(const id of ['radar','recherche','werte','mehr','suche','jetzt']){await p.evaluate(id=>raumZeigen(id),id);assert.equal(await p.locator('#raum-'+id).isVisible(),true);const hidden=await p.locator('.raum[hidden]').evaluateAll(es=>es.every(e=>e.inert&&e.getClientRects().length===0));assert(hidden)}
    assert.equal(await p.locator('dialog:not([open])').evaluateAll(es=>es.every(e=>e.getClientRects().length===0)),true);await f.close();
  });
  await check('Nachtrag: DOM-Reihenfolge nach Bestand, stabil vor/nach Großfeeds',async()=>{
    for(const width of [375,1280])for(const theme of ['dark','light'])for(const symbol of [null,'AA','CC']){
      const f=await fresh({positions:symbol?[position('p1',symbol)]:[],slow:['quotes.json'],wait:false,viewportWidth:width,theme}),p=f.page;
      await p.locator('#digestTitel').waitFor();const expected=symbol?['jetztFokus','jetztDigest','jetztMarkt']:['jetztDigest','jetztFokus','jetztMarkt'];
      const order=()=>p.locator('#raum-jetzt > .now-section').evaluateAll(es=>es.map(e=>e.id));
      assert.deepEqual(await order(),expected);assert.equal(await p.locator('#digestTitel').innerText(),'Allgemeine Marktlage');
      assert.equal(await p.evaluate(()=>NOW_GROSS_DONE),false);while(!f.gates['quotes.json'])await new Promise(r=>setTimeout(r,5));f.gates['quotes.json']();await p.waitForFunction(()=>NOW_GROSS_DONE);assert.deepEqual(await order(),expected);
      if(!symbol){await p.locator('[data-add="AAPL"]').focus();await p.keyboard.press('Enter');assert.deepEqual(await order(),expected,'Quick-Add verschiebt nicht die aktuelle Leseposition')}
      else await p.screenshot({path:path.join(out,`fokus-zuerst-${width}-${theme}-${symbol==='AA'?'ereignis':'ohne'}.png`),animations:'disabled'});
      await f.close();
    }
  });
  await check('Echte öffentliche lokale Feeds, erste Ansicht und verfügbare Indexcharts',async()=>{
    const f=await fresh({data:null}),p=f.page;assert.equal(await p.locator('.digest-lead').count(),1);assert.equal(await p.evaluate(()=>NOW_INDICES.length>0),true);
    for(const width of [375,1280])for(const theme of ['dark','light']){
      await p.setViewportSize({width,height:1000});await p.evaluate(theme=>{themeSetzen(theme);window.scrollTo(0,0)},theme);await p.evaluate(()=>document.fonts.ready);
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,`real-${width}-${theme}.png`),animations:'disabled'});
    }
    await p.locator('#indicesToggle').click();const buttons=p.locator('[data-index]');assert(await buttons.count()>0);
    for(let i=0;i<await buttons.count();i++){await buttons.nth(i).click();await p.waitForFunction(()=>!!NOW_INDEX_CHART);assert.equal(await p.locator('#indexStatus').innerText(),'');await p.keyboard.press('Escape')}
    await f.close();
  });
  console.log(JSON.stringify({passed:passed.length,metrics,output:out}));
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({generated_at:new Date().toISOString(),duration_seconds:(performance.now()/1000).toFixed(2),passed,metrics,source_sha256:crypto.createHash('sha256').update(source).digest('hex')},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.close()});
