import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {resolveMakani} from '../src/makani-service.mjs';
import {loadCorridor} from '../src/corridor-service.mjs';
const root=process.cwd(),port=Number(process.env.PORT||4177),host=process.env.HOST||'127.0.0.1',cache=new Map(),corridorCache=new Map(),searchCache=new Map();let corridorBusy=false,searchQueue=Promise.resolve(),lastSearch=0;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain'};
const mergeWorld=(base,next)=>({...next,roads:[...new Map([...base.roads,...next.roads].map(r=>[r.id,r])).values()],buildings:[...new Map([...base.buildings,...next.buildings].map(r=>[r.id,r])).values()],places:[...new Map([...base.places,...next.places].map(r=>[r.id,r])).values()],signals:[...new Map([...base.signals,...next.signals].map(r=>[r.id,r])).values()],restrictions:[...new Map([...base.restrictions,...next.restrictions].map(r=>[JSON.stringify(r),r])).values()],water:[...(base.water||[]),...(next.water||[])]});
const nearGeo=(a,b)=>Array.isArray(a)&&a.length===2&&a.every(Number.isFinite)&&Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*100800)<1600;
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"status":"ok"}');return}
  if(url.pathname==='/api/corridor'||url.pathname==='/api/search'){
    if(req.method!=='POST'){res.writeHead(405);res.end();return}
    if(req.headers.origin&&!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(req.headers.origin)){res.writeHead(403);res.end();return}
    let input='';req.on('data',chunk=>{input+=chunk;if(input.length>2000)req.destroy()});req.on('end',async()=>{try{const args=JSON.parse(input);let result;
      if(url.pathname==='/api/corridor'){
        const key=JSON.stringify([args.from,args.to]);result=corridorCache.get(key);if(!result){if(corridorBusy)throw Error('A map corridor is already being prepared. Please wait.');corridorBusy=true;try{
          const base=JSON.parse(fs.readFileSync(path.join(root,'data/world.json'),'utf8'));
          const bundled=path.join(root,'data/mall-corridor.json');
          const marina=[25.0869,55.14499],mall=[25.1974,55.2797];
          const covered=nearGeo(args.from,marina)&&nearGeo(args.to,mall)||nearGeo(args.from,mall)&&nearGeo(args.to,marina);
          const next=covered&&fs.existsSync(bundled)?JSON.parse(fs.readFileSync(bundled,'utf8')):await loadCorridor(args.from,args.to);
          result=mergeWorld(base,next);corridorCache.set(key,result);if(corridorCache.size>2)corridorCache.delete(corridorCache.keys().next().value)
        }finally{corridorBusy=false}}
      }else{
        const q=String(args.query||'').trim().slice(0,150);if(q.length<3)throw Error('Enter a building or address with at least three characters.');result=searchCache.get(q);
        if(!result){const work=searchQueue.then(async()=>{await new Promise(resolve=>setTimeout(resolve,Math.max(0,1100-(Date.now()-lastSearch))));lastSearch=Date.now();const base=process.env.NOMINATIM_URL||'https://nominatim.openstreetmap.org/search',endpoint=new URL(base);endpoint.search=new URLSearchParams({q:q+', Dubai, United Arab Emirates',format:'jsonv2',limit:'1',countrycodes:'ae',viewbox:'54.8,25.5,55.7,24.7',bounded:'1'});const reply=await fetch(endpoint,{headers:{'User-Agent':'DubaiDrive/0.3 local driving training (OpenStreetMap data)','Accept-Language':'en'},signal:AbortSignal.timeout(15000)});if(!reply.ok)throw Error('Online place search is unavailable. Use a Makani number or coordinates.');const hits=await reply.json();if(!hits.length)throw Error('No matching Dubai place was found. Try its Makani number.');return{name:hits[0].display_name,lat:Number(hits[0].lat),lon:Number(hits[0].lon),source:'OpenStreetMap Nominatim'}});searchQueue=work.catch(()=>{});result=await work;searchCache.set(q,result);if(searchCache.size>60)searchCache.delete(searchCache.keys().next().value)}
      }
      const raw=Buffer.from(JSON.stringify(result)),gzip=req.headers['accept-encoding']?.includes('gzip');res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(gzip?zlib.gzipSync(raw):raw);
    }catch(error){res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:error.message}))}});return;
  }
  if(url.pathname==='/api/makani'){
    if(req.method!=='POST'){res.writeHead(405);res.end();return}
    if(req.headers.origin&&!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(req.headers.origin)){res.writeHead(403);res.end();return}
    let input='';req.on('data',chunk=>{input+=chunk;if(input.length>2000)req.destroy()});req.on('end',async()=>{try{const {number}=JSON.parse(input),result=await resolveMakani(number);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result))}catch(error){res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:error.message}))}});return;
  }
  let name;try{name=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname))}catch{res.writeHead(400);res.end();return}
  if(!name.startsWith(root+path.sep)||name.includes('/work/')||name.includes('/.git/')){res.writeHead(403);res.end();return}
  fs.stat(name,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404);res.end('Not found');return}
    const key=name+':'+stat.mtimeMs;let asset=cache.get(key);if(!asset){const raw=fs.readFileSync(name);asset={raw,gzip:zlib.gzipSync(raw)};cache.set(key,asset);if(cache.size>60)cache.delete(cache.keys().next().value)}
    const gzip=req.headers['accept-encoding']?.includes('gzip');res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-cache','Vary':'Accept-Encoding',...(gzip?{'Content-Encoding':'gzip'}:{})});res.end(gzip?asset.gzip:asset.raw);
  });
}).listen(port,host,()=>console.log(`Dubai Drive ready: http://${host}:${port}`));
