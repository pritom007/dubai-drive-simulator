import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildNetwork,routeBetween,permitted,routeProjection,edgePosition,distance,nearestEdge} from '../src/network.js';
import {DrivingEngine} from '../src/engine.js';
import {stepVehicle} from '../src/simulation.js';

const world=JSON.parse(fs.readFileSync(new URL('../data/world.json',import.meta.url)));
const net=buildNetwork(world);
const place=name=>{const p=world.places.find(p=>p.name===name);assert(p,'missing '+name);return p};
let assertions=0;
for(const[a,b]of[['Cayan Tower','Almas Tower'],['Almas Tower','Cayan Tower'],['Dubai Marina Mall','Princess Tower'],['Princess Tower','Dubai Marina Mall']]){
  const r=routeBetween(net,place(a).p,place(b).p);assert(r&&r.length>200,`${a} → ${b} must be reachable`);
  let total=0;for(let i=0;i<r.steps.length;i++){const step=r.steps[i];assert(step.start>=0&&step.end<=1&&step.start<=step.end);total+=step.length;if(i){const previous=r.steps[i-1];assert.equal(previous.edge.to,step.edge.from,'edges must share a real source node');assert(distance(previous.edge.b,step.edge.a)<.1,'zero scene transitions');assert(permitted(net,previous.edge,step.edge),'route must obey supported restrictions')}}assert(Math.abs(total-r.length)<.01);assert(r.endAccess<120);console.log(`${a} → ${b}: ${(r.length/1000).toFixed(2)} km, ${r.steps.length} connected segments`);assertions+=5;
}

// Two roads cross geometrically but have no shared source node.
const crossing={roads:[{id:'a',points:[[-10,0],[10,0]],nodeIds:['1','2'],oneway:true,maxspeed:50,lanes:1},{id:'b',points:[[0,-10],[0,10]],nodeIds:['3','4'],oneway:true,maxspeed:50,lanes:1}],restrictions:[]};
assert.equal(routeBetween(buildNetwork(crossing),[-8,0],[0,8]),null,'an overpass crossing must not create a junction');assertions++;
const layered={roads:[{id:'highway',points:[[0,0],[0,100]],nodeIds:['h1','h2'],oneway:true,maxspeed:100,lanes:6},{id:'flyover',points:[[-30,50],[30,50]],nodeIds:['f1','f2'],oneway:true,maxspeed:60,lanes:2}],restrictions:[]};assert.equal(nearestEdge(buildNetwork(layered),[-8.75,50],0).edge.road.id,'highway','an occupied highway lane must not match a crossing flyover');assertions++;
const a={from:'1',to:'2',road:{id:'a'}},b={from:'2',to:'3',road:{id:'b'}};
assert(!permitted({restrictionMap:new Map([['2:a',[{from:'a',to:'b',via:'2',type:'no_right_turn'}]]])},a,b));assertions++;

// Braking held at rest must never reverse a vehicle in Drive.
const stopped={x:0,z:0,speed:0,steer:0,heading:0,distance:0};for(let i=0;i<600;i++)stepVehicle(stopped,{brake:true,steer:0},1/60);assert.equal(stopped.speed,0);assert.equal(stopped.z,0);assertions++;
const highway={x:0,z:0,speed:28,steer:0,heading:0,distance:0};for(let i=0;i<60;i++)stepVehicle(highway,{throttle:true,steer:1},1/60);assert(Math.abs(highway.heading)<.14,'highway steering must respect comfortable lateral acceleration');assertions++;

// Follow every source segment with the real navigation engine. This is a
// deterministic navigation replay, not a vehicle-handling/autopilot claim.
const engine=new DrivingEngine(world);engine.start(place('Cayan Tower'),place('Almas Tower'));engine.traffic=[];const original=engine.route;for(const step of original.steps){const p=edgePosition(step.edge,step.edge.length*(step.start+step.end)/2,0);Object.assign(engine.car,p,{speed:0});engine.update(1/60);assert(engine.position.distance<step.edge.road.lanes*3.5+1,'mapped lane remains close to route');}assertions++;

// Put the player on a real alternate road and let deviation detection reroute.
engine.start(place('Cayan Tower'),place('Almas Tower'));engine.traffic=[];const alternate=world.places.find(p=>p.name==='Dubai Marina Mall');const recovery=routeBetween(net,alternate.p,place('Almas Tower').p);assert(recovery);const candidate=recovery.steps.find(s=>routeProjection(engine.route,edgePositionArray(s.edge,s.edge.length*.5)).distance>35);assert(candidate,'need a distinct recoverable road');const p=edgePosition(candidate.edge,candidate.edge.length*.5,0);Object.assign(engine.car,p,{speed:0});const before=[engine.car.x,engine.car.z];for(let i=0;i<150;i++)engine.update(1/60);assert(engine.events.some(e=>e.type==='reroute'),'wrong road must recalculate');assert.equal(engine.to.name,'Almas Tower','reroute must keep destination');assert(distance(before,[engine.car.x,engine.car.z])<.01,'rerouting cannot teleport');assertions+=3;
console.log(`${assertions} network, routing, braking, navigation replay and recovery checks passed.`);
function edgePositionArray(e,s){const p=edgePosition(e,s,0);return[p.x,p.z]}
