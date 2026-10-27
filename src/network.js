export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export function buildNetwork(world){
  const nodes=new Map(),edges=[],adj=new Map();
  const add=(road,i,reverse)=>{const from=road.nodeIds[reverse?i+1:i],to=road.nodeIds[reverse?i:i+1],a=road.points[reverse?i+1:i],b=road.points[reverse?i:i+1],length=distance(a,b);if(length<.01)return;const edge={id:edges.length,road,from,to,a,b,length,heading:Math.atan2(b[0]-a[0],b[1]-a[1]),reverse};edges.push(edge);if(!adj.has(from))adj.set(from,[]);adj.get(from).push(edge)};
  for(const road of world.roads){road.points.forEach((p,i)=>nodes.set(road.nodeIds[i],p));for(let i=0;i<road.points.length-1;i++){add(road,i,false);if(!road.oneway)add(road,i,true)}}
  const restrictionMap=new Map();for(const r of world.restrictions||[]){const key=r.via+':'+r.from;if(!restrictionMap.has(key))restrictionMap.set(key,[]);restrictionMap.get(key).push(r)}
  const grid=new Map(),cellSize=90;
  for(const edge of edges){const minX=Math.floor(Math.min(edge.a[0],edge.b[0])/cellSize),maxX=Math.floor(Math.max(edge.a[0],edge.b[0])/cellSize),minZ=Math.floor(Math.min(edge.a[1],edge.b[1])/cellSize),maxZ=Math.floor(Math.max(edge.a[1],edge.b[1])/cellSize);for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(edge)}}
  return {nodes,edges,adj,restrictionMap,world,grid,cellSize};
}
export function permitted(net,previous,next){
  if(!previous)return true;
  const rules=net.restrictionMap.get(next.from+':'+previous.road.id)||[];
  if(rules.some(r=>r.type.startsWith('only_')&&r.to!==next.road.id))return false;
  if(rules.some(r=>r.type.startsWith('no_')&&r.to===next.road.id&&(r.type!=='no_u_turn'||next.to===previous.from)))return false;
  return true;
}
export function nearestEdge(net,p,heading=null,avoidBuilding=null){let best=null;const candidates=new Set(),x=Math.floor(p[0]/net.cellSize),z=Math.floor(p[1]/net.cellSize);for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(const edge of net.grid.get((x+dx)+','+(z+dz))||[])candidates.add(edge);for(const e of candidates.size?candidates:net.edges){const dx=e.b[0]-e.a[0],dz=e.b[1]-e.a[1],t=clamp(((p[0]-e.a[0])*dx+(p[1]-e.a[1])*dz)/(e.length**2),0,1),point=[e.a[0]+dx*t,e.a[1]+dz*t],d=distance(p,point),orientation=heading===null?0:Math.abs(angle(e.heading-heading))*4,score=(heading===null?d:d/Math.max(1,e.road.lanes*1.75))+orientation;if(avoidBuilding&&pointInPolygon(point,avoidBuilding.points))continue;if(!best||score<best.score)best={edge:e,t,point,distance:d,score}}return best}

// Edge-state A*: previous road identity is retained so node-via turn
// restrictions can be enforced. Coordinate crossings never create edges.
export function routeBetween(net,start,end,heading=null){
  const startBuilding=heading===null?net.world.buildings?.find(b=>pointInPolygon(start,b.points)):null;
  const endBuilding=net.world.buildings?.find(b=>pointInPolygon(end,b.points));
  const origin=nearestEdge(net,start,heading,startBuilding),destination=nearestEdge(net,end,null,endBuilding);
  if(!origin||!destination)return null;
  if(origin.distance>120||destination.distance>120)return null;
  const targets=net.edges.filter(e=>e.road.id===destination.edge.road.id&&((e.from===destination.edge.from&&e.to===destination.edge.to)||(e.from===destination.edge.to&&e.to===destination.edge.from)));
  const starts=net.edges.filter(e=>e.road.id===origin.edge.road.id&&((e.from===origin.edge.from&&e.to===origin.edge.to)||(heading===null&&e.from===origin.edge.to&&e.to===origin.edge.from)));
  const open=[],cost=new Map(),parent=new Map(),rootT=new Map(),states=new Map();
  for(const e of starts){const t=e.from===origin.edge.from?origin.t:1-origin.t,c=e.length*(1-t)/(e.road.maxspeed/3.6),key=e.id+':start';cost.set(key,c);rootT.set(key,t);states.set(key,e);heapPush(open,{edge:e,key,f:c+distance(e.b,destination.point)/33})}
  let found=null,endT=1;
  while(open.length){const item=heapPop(open),current=item.edge,key=item.key;
    const goal=targets.find(e=>e.id===current.id);if(goal){const t=current.from===destination.edge.from?destination.t:1-destination.t;if(!rootT.has(key)||t>=rootT.get(key)){found=key;endT=t;break}}
    for(const next of net.adj.get(current.to)||[]){if(!permitted(net,current,next))continue;const uturn=next.to===current.from?14:0,turn=Math.abs(angle(next.heading-current.heading)),g=cost.get(key)+next.length/(next.road.maxspeed/3.6)+uturn+(turn>.6?2:0);if(g<(cost.get(next.id)??Infinity)){cost.set(next.id,g);states.set(next.id,next);parent.set(next.id,key);heapPush(open,{edge:next,key:next.id,f:g+distance(next.b,destination.point)/33})}}
  }
  if(found===null)return null;
  const chain=[];let id=found;while(id!==undefined){chain.unshift({edge:states.get(id),key:id});id=parent.get(id)}
  const steps=chain.map(({edge,key},i)=>({edge,start:i===0?(rootT.get(key)||0):0,end:i===chain.length-1?endT:1}));
  let length=0;for(const s of steps){s.offset=length;s.length=s.edge.length*(s.end-s.start);length+=s.length}
  return{steps,length,start:origin.point,end:destination.point,startAccess:origin.distance,endAccess:destination.distance,destination:end};
}
export function routeProjection(route,p){let best={distance:Infinity,s:0,index:0};for(let i=0;i<route.steps.length;i++){const s=route.steps[i],e=s.edge,dx=e.b[0]-e.a[0],dz=e.b[1]-e.a[1],t=clamp(((p[0]-e.a[0])*dx+(p[1]-e.a[1])*dz)/(e.length**2),s.start,s.end),point=[e.a[0]+dx*t,e.a[1]+dz*t],d=distance(point,p);if(d<best.distance)best={distance:d,s:s.offset+(t-s.start)*e.length,index:i,point,edge:e}}return best}
export function laneOffset(edge,lane=0){const count=Math.max(1,edge.road.oneway?edge.road.lanes:Math.floor(edge.road.lanes/2));return edge.road.oneway?(lane-(count-1)/2)*3.5:(lane+.5)*3.5}
export function edgePosition(edge,s,lane=0){const t=clamp(s/edge.length,0,1),offset=laneOffset(edge,lane);return{x:edge.a[0]+(edge.b[0]-edge.a[0])*t+Math.cos(edge.heading)*offset,z:edge.a[1]+(edge.b[1]-edge.a[1])*t-Math.sin(edge.heading)*offset,heading:edge.heading}}
export function angle(v){return Math.atan2(Math.sin(v),Math.cos(v))}
function heapPush(heap,item){let i=heap.length;heap.push(item);while(i>0){const parent=(i-1)>>1;if(heap[parent].f<=item.f)break;heap[i]=heap[parent];i=parent}heap[i]=item}
function heapPop(heap){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].f<heap[child].f)child++;if(heap[child].f>=last.f)break;heap[i]=heap[child];i=child}heap[i]=last}return first}
export function pointInPolygon(p,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
export function maneuver(route,index){for(let i=Math.max(1,index+1);i<route.steps.length;i++){const before=route.steps[i-1],after=route.steps[i];if(before.edge.road.id===after.edge.road.id)continue;const delta=angle(after.edge.heading-before.edge.heading);if(before.edge.road.name===after.edge.road.name&&Math.abs(delta)<.45)continue;const r=after.edge.road,name=r.name||r.destination||r.ref||'the connecting road',text=r.type.includes('link')?'Take the exit'+(r.destination?' toward '+r.destination:' onto the connecting ramp'):Math.abs(delta)<.35?'Continue onto '+name:delta>0?'Turn right onto '+name:'Turn left onto '+name;return{s:after.offset,text,edge:after.edge}}return{s:route.length,text:'Arrive at the mapped road access',arrival:true}}
