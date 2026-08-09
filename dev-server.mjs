import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import analyze from './api/analyze.js';
import review from './api/review.js';

const root = new URL('.', import.meta.url).pathname;
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.sql':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8'};
function wrapRes(res){return {status(code){res.statusCode=code;return this},json(value){res.setHeader('content-type','application/json');res.end(JSON.stringify(value));return this}}}
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/api/analyze'||req.url==='/api/review'){
      let raw='';for await(const c of req) raw+=c;req.body=raw?JSON.parse(raw):{};
      return (req.url==='/api/analyze'?analyze:review)(req,wrapRes(res));
    }
    const urlPath=(req.url==='/'?'/index.html':req.url.split('?')[0]);
    const safe=normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const path=join(root,safe);
    const data=await readFile(path);res.statusCode=200;res.setHeader('content-type',mime[extname(path)]||'application/octet-stream');res.end(data);
  }catch(e){res.statusCode=404;res.end('Not found');}
});
const port=Number(process.env.PORT||4173);server.listen(port,'127.0.0.1',()=>console.log(`ChangeGuard demo: http://127.0.0.1:${port}`));
