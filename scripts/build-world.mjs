import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

// The raw extract is the audit trail. Shared OSM node IDs, not coordinate
// proximity, determine connectivity: bridges crossing streets are not junctions.
export function buildWorld(xml){
const origin = { lat: 25.08014, lon: 55.14594 };
const project = (lat, lon) => [+(111320 * Math.cos(origin.lat * Math.PI/180) * (lon-origin.lon)).toFixed(2), +(111320*(lat-origin.lat)).toFixed(2)];
const decode = s => s.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');
const attrs = text => Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)].map(m=>[m[1],decode(m[2])]));
const tagsOf = text => Object.fromEntries([...text.matchAll(/<tag\s+([^>]+)\/>/g)].map(m=>{const a=attrs(m[1]);return[a.k,a.v]}));
const nodes = new Map(), buildings = [], places = [], roads = [], restrictions = [], water = [];
for(const m of xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)){
  const a=attrs(m[1]),tags=tagsOf(m[2]||'');nodes.set(a.id,{id:a.id,p:project(+a.lat,+a.lon),tags});
  if(tags.name && (tags.amenity||tags.shop||tags.tourism||tags['addr:housenumber']))places.push({id:'n'+a.id,name:tags['name:en']||tags.name,p:project(+a.lat,+a.lon),address:address(tags),kind:tags.amenity||tags.tourism||tags.shop||'address'});
}
const drivable=new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','residential','unclassified','living_street','service']);
for(const m of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)){
  const a=attrs(m[1]),t=tagsOf(m[2]),ids=[...m[2].matchAll(/<nd ref="(\d+)"\s*\/>/g)].map(m=>m[1]);
  if(ids.some(id=>!nodes.has(id)))continue;
  const points=ids.map(id=>nodes.get(id).p);
  if((t.natural==='water'||t.waterway==='riverbank')&&points.length>3)water.push(points);
  if(t.building&&t.building!=='no'&&points.length>3){
    const ring=points.slice(0,-1),p=ring.reduce((s,p)=>[s[0]+p[0]/ring.length,s[1]+p[1]/ring.length],[0,0]);
    const height=parseFloat(t.height),levels=parseFloat(t['building:levels']);
    const b={id:'w'+a.id,name:t['name:en']||t.name||'',nameAr:t['name:ar']||'',p,points,height:Number.isFinite(height)?height:Number.isFinite(levels)?levels*3.2:15,heightSource:Number.isFinite(height)?'height tag':Number.isFinite(levels)?'levels × 3.2 m':'assumed 15 m',address:address(t),kind:t.building,entrances:ids.filter(id=>nodes.get(id).tags.entrance).map(id=>({p:nodes.get(id).p,kind:nodes.get(id).tags.entrance}))};
    buildings.push(b);
    if(b.name||b.address)places.push({id:b.id,name:b.name||b.address,p:b.entrances[0]?.p||p,address:b.address,kind:'building',entrance:!!b.entrances.length});
  }
  if(!drivable.has(t.highway)||t.area==='yes'||['no','private'].includes(t['motor_vehicle'])||['no','private'].includes(t['motorcar'])||['no','private'].includes(t.access))continue;
  let oneway=['yes','1','-1'].includes(t.oneway)||(!['no','0'].includes(t.oneway)&&(t.highway==='motorway'||t.junction==='roundabout'));
  if(t.oneway==='-1'){ids.reverse();points.reverse()}
  const taggedLanes=parseInt(t.lanes),lanes=Number.isFinite(taggedLanes)?taggedLanes:t.highway==='motorway'?6:t.highway.includes('link')?1:t.highway==='service'?1:2;
  roads.push({id:a.id,nodeIds:ids,points,type:t.highway,name:t['name:en']||t.name||'',nameAr:t['name:ar']||'',ref:t.ref||'',oneway,lanes,maxspeed:parseFloat(t.maxspeed)|| (t.highway==='motorway'?100:t.highway.includes('link')?50:t.highway==='service'?20:50),lanesSource:Number.isFinite(taggedLanes)?'OSM tag':'assumed',speedSource:t.maxspeed?'OSM tag':'assumed',layer:+t.layer||0,bridge:t.bridge&&t.bridge!=='no',tunnel:t.tunnel&&t.tunnel!=='no',destination:t['destination:en']||t.destination||'',turnLanes:t['turn:lanes']||'',access:t.access||'public or unspecified'});
}
for(const m of xml.matchAll(/<relation\b[^>]*>([\s\S]*?)<\/relation>/g)){
  const t=tagsOf(m[1]);if(t.type!=='restriction'||!t.restriction||t.except?.includes('motorcar'))continue;
  const members=[...m[1].matchAll(/<member\s+([^>]+)\/>/g)].map(m=>attrs(m[1]));
  const from=members.find(x=>x.role==='from'),to=members.find(x=>x.role==='to'),via=members.find(x=>x.role==='via');
  if(from&&to&&via?.type==='node')restrictions.push({from:from.ref,to:to.ref,via:via.ref,type:t.restriction});
}
const signals=[...nodes.values()].filter(n=>n.tags.highway==='traffic_signals').map(n=>({id:n.id,p:n.p}));
const b=xml.match(/<bounds\s+([^>]+)\/>/);const bounds=b?attrs(b[1]):{minlat:Infinity,minlon:Infinity,maxlat:-Infinity,maxlon:-Infinity};
if(!b)for(const node of nodes.values()){const lat=origin.lat+node.p[1]/111320,lon=origin.lon+node.p[0]/(111320*Math.cos(origin.lat*Math.PI/180));bounds.minlat=Math.min(bounds.minlat,lat);bounds.maxlat=Math.max(bounds.maxlat,lat);bounds.minlon=Math.min(bounds.minlon,lon);bounds.maxlon=Math.max(bounds.maxlon,lon)}
const world={meta:{source:'OpenStreetMap contributors',license:'ODbL 1.0',origin,bounds,captured:xml.match(/osm_base="([^"]+)"/)?.[1]||'2026-10-19',coverage:'Marina / JLT corridor',laneGeometry:'Approximate reconstruction from centerlines and lane tags',buildingGeometry:'OSM footprints; heights tagged or explicitly estimated'},roads,buildings,places,restrictions,signals,water};
return world;
function address(t){return[t['addr:housenumber'],t['addr:street'],t['addr:unit'],t['addr:city']].filter(Boolean).join(', ')}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const input=process.argv[2]||'work/marina.osm',output=process.argv[3]||'data/world.json',world=buildWorld(fs.readFileSync(input,'utf8'));fs.mkdirSync('data',{recursive:true});fs.writeFileSync(output,JSON.stringify(world));console.log(JSON.stringify({roads:world.roads.length,buildings:world.buildings.length,places:world.places.length,restrictions:world.restrictions.length,signals:world.signals.length,bytes:fs.statSync(output).size}))}
