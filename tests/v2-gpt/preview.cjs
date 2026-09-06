// Lokale Webvorschau: keine file://-Fetches, kein Browser-Sicherheits-Override.
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch(e){res.writeHead(400).end();return}
  if(name==='/')name='/v2-gpt.html';
  if(!/^\/(?:v2-gpt\.html|v2\.html|index\.html|favicon\.ico|(?:data|fonts)\/[A-Za-z0-9_.-]+)$/.test(name)){res.writeHead(404).end();return}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body)});
});
server.listen(Number(process.env.GPT_PREVIEW_PORT)||0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+'/v2-gpt.html'));
