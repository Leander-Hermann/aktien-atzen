// Ausschließlich künstliche öffentliche Testdaten; keine Browser-/Nutzerbestände.
const today='2026-09-06';
function candles(){return [0,1,2,3,4,5].map((n)=>({time:1788134400+n*86400,open:100+n,high:110+n,low:90+n,close:100+n*2}))}
function position(id,symbol,typ='beobachtung'){return {id,symbol,typ,added_at:'2026-01-01'}}
function feeds(){
  return {
    'index.json':[{date:'2026-09-05',label:'5. September'},{date:'2026-09-04'}],
    '2026-09-05.json':{date:'2026-09-05',topics:[
      {title:'Niedrige Nachricht',prio:1,body:'Originaltext niedrig.'},
      {title:'Erste wichtige Nachricht',prio:3,time:'16:30',body:'Vollständiger **Originaltext** mit allen Details.',timing:'Nach dem Schluss.',verlauf:'Zuerst A, danach B.',einordnung:'Vorhandene Einordnung der Meldung.',begriffe:[{term:'Begriff',erklaerung:'Eine **Erklärung**.'}],sources:[{l:'Testquelle',u:'https://example.com/article?a=1&b=2'}]},
      {title:'Mittlere Nachricht',prio:2,body:'Originaltext mittel.'},
      {title:'Zweite wichtige Nachricht',prio:3,body:'Originaltext hoch.'},
      {title:'Ungültige Priorität',prio:9},{title:'Priorität als Text',prio:'3'},{title:'',prio:3}
    ],reads:[{s:'Lesestoff',h:'Weiterführender Artikel',u:'https://example.com/read'}]},
    'market.json':{updated:'2026-09-04T14:20:00Z',feargreed:{score:42,rating:'Angst'},indices:['Nasdaq 100 Future','DAX','Brent Öl','S&P 500 Future','Gold','EUR/USD'].map((nm,i)=>({nm,val:i===2?'67,45':'23.456,78',pct:i-2,candles:i===5?{}:{d1:candles(),h1:candles()}})),
      gainers:[{t:'AA',n:'Alpha',p:10,candles:{d1:candles()}},{t:'BB',n:'Beta',p:8},{t:'AA',n:'Alpha Duplikat',p:5}],
      losers:[{t:'CC',n:'Gamma',p:-10},{t:'DD',n:'Delta',p:-7},{t:'EE',n:'Epsilon',p:-6}],
      actives:[{t:'AA',n:'Alpha',p:10},{t:'FF',n:'Zeta',p:0},{t:'GG',n:'Eta',p:1}]},
    'videos.json':{videos:[]},'videos-index.json':{videos:[]},'ideas.json':{items:[]},'earnings-recap.json':{eintraege:[]},
    'earnings.json':{eintraege:[{ticker:'AA',name:'Alpha',date:today,status:'upcoming'},{ticker:'BB',date:'2026-09-08',status:'upcoming'},{ticker:'CC',date:'2026-09-09',status:'upcoming'}]},
    'candidates.json':{items:[]},
    'radar.json':{_meta:{status:'fresh'},items:[{symbol:'AA',name:'Alpha',score:60,triggers:[{label:'Kursbewegung',value:'+4 %',weight:10}]}]},
    'quotes.json':{quotes:{AA:{price:110,cur:'USD',pct:999,as_of:'2026-09-03T20:00:00Z',candles:candles()},BB:{price:0,cur:'EUR',as_of:null,candles:[]}}},
    'ticker-index.json':{ticker:{AA:{name:'Alpha',auftritte:[{date:'2026-09-01',channel:'Alter Kanal',url:'https://www.youtube.com/watch?v=old&t=20s'},{date:'2026-09-05',channel:'Testkanal',url:'https://www.youtube.com/watch?v=latest&t=196s'}]},BB:{name:'Beta',auftritte:[{date:'2026-09-01',channel:'Ohne Zeit',url:'https://youtu.be/video'}]},CC:{name:'Gamma',auftritte:[{date:'2026-09-01',channel:'Unsicher',url:'javascript:alert(1)'}]}}}
  };
}
module.exports={today,candles,position,feeds};
