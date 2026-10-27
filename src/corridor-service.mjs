import {buildWorld} from '../scripts/build-world.mjs';

const headers={'User-Agent':'DubaiDrive/0.3 local driving-training prototype'};
const coordinate=p=>{if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<24.7||p[0]>25.5||p[1]<54.8||p[1]>55.7)throw Error('Enter coordinates within Dubai.');return p};
export async function loadCorridor(from,to,fetcher=fetch){
  coordinate(from);coordinate(to);
  const coordinates=`${from[1]},${from[0]};${to[1]},${to[0]}`;
  const routeResponse=await fetcher(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,{headers,signal:AbortSignal.timeout(20000)});
  if(!routeResponse.ok)throw Error('The route discovery service is unavailable. Bundled Marina/JLT routes still work offline.');
  const answer=await routeResponse.json(),route=answer.routes?.[0];if(!route)throw Error('No driving route was returned for these endpoints.');
  if(route.distance>60000)throw Error('Choose a route under 60 km for this lightweight prototype.');
  const points=route.geometry.coordinates;
  // Keep samples at about 300 m to preserve the route's geometry without
  // constructing one large city bounding box or issuing tile request bursts.
  const sampled=[points[0]];let travelled=0;for(let i=1;i<points.length;i++){travelled+=geoDistance(points[i-1],points[i]);if(travelled>300){sampled.push(points[i]);travelled=0}}sampled.push(points.at(-1));
  const line=sampled.map(p=>p[1].toFixed(6)+','+p[0].toFixed(6)).join(',');
  const query=`[out:xml][timeout:120];way[highway](around:650,${line})->.roads;(way[building](around:200,${line});way[natural=water](around:250,${line});.roads;rel(bw.roads)[type=restriction];);(._;>;);out body;`;
  const response=await fetcher('https://overpass-api.de/api/interpreter',{method:'POST',headers:{...headers,'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(query),signal:AbortSignal.timeout(140000)});
  if(!response.ok)throw Error('The map corridor service is busy. Try again later; bundled routes remain available.');
  const xml=await response.text();if(xml.includes('<remark>')||!xml.includes('<osm'))throw Error('The map service did not return a complete corridor.');
  const world=buildWorld(xml);if(!world.roads.length)throw Error('No drivable roads were returned.');
  world.meta.coverage='Downloaded Dubai route corridor';world.meta.corridor={from,to,discoveryDistance:route.distance,roadRadius:650,buildingRadius:200};return world;
}
function geoDistance(a,b){return Math.hypot((a[0]-b[0])*100800,(a[1]-b[1])*111320)}
