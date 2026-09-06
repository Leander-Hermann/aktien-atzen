// Gegenprobe file:// versus lokale Webadresse, ausschließlich frische Browserkontexte.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const root=path.resolve(__dirname,'../..'),out=process.env.GPT_TEST_OUTPUT||path.join(os.tmpdir(),'aktien-atzen-v2-gpt-tests');
const target=process.argv[2];if(!target||!/^http:\/\/127\.0\.0\.1:\d+\/v2-gpt\.html$/.test(target))throw Error('Lokale URL aus preview.cjs als Argument angeben');
const chart=fs.readFileSync(process.env.CHART_LIBRARY_FILE||path.join(out,'lightweight-charts-4.1.3.js'),'utf8');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)}),results=[];
  try{for(const url of [pathToFileURL(path.join(root,'v2-gpt.html')).href,target]){
    const context=await browser.newContext({viewport:{width:1280,height:1000},colorScheme:'dark'}),page=await context.newPage(),errors=[],failures=[];
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('requestfailed',r=>failures.push(r.failure()?.errorText));
    await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:chart}));
    await page.route('https://gc.zgo.at/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
    await page.goto(url);await page.waitForFunction(()=>NOW_GROSS_DONE);
    const file=url.startsWith('file:'),topics=await page.locator('[data-topic]').count(),indices=await page.evaluate(()=>NOW_INDICES.length);
    if(file){assert.equal(topics,0);assert(errors.some(e=>/CORS|Access-Control|cross origin|blocked/i.test(e)))}
    else{assert(topics>0);assert(indices>0);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'lokale-gpt-vorschau.png'),animations:'disabled'})}
    results.push({protocol:file?'file:':'http:',topics,indices,consoleErrors:errors.length,failedRequests:failures.length,expected:file?'Browser blockiert lokale JSON-Abrufe':'Digest und Markt laden'});await context.close();
  }
  const report={checked_at:new Date().toISOString(),duration_seconds:performance.now()/1000,results};fs.writeFileSync(path.join(out,'preview-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
