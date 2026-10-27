import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildNetwork,routeBetween,distance,permitted} from '../src/network.js';
const world=JSON.parse(fs.readFileSync(new URL('../data/mall-corridor.json',import.meta.url)));
const net=buildNetwork(world),local=(lat,lon)=>[(lon-world.meta.origin.lon)*111320*Math.cos(world.meta.origin.lat*Math.PI/180),(lat-world.meta.origin.lat)*111320];
const start=performance.now(),route=routeBetween(net,local(25.0869,55.14499),local(25.1974,55.2797));
assert(route,'Marina to Dubai Mall must have a connected route');assert(route.length>19000&&route.length<30000,'long route must follow a plausible Dubai corridor');
for(let i=1;i<route.steps.length;i++){const a=route.steps[i-1].edge,b=route.steps[i].edge;assert.equal(a.to,b.from);assert(distance(a.b,b.a)<.01);assert(permitted(net,a,b))}
const motorwaySteps=route.steps.filter(s=>s.edge.road.type==='motorway');assert(motorwaySteps.length>10,'must physically use the real highway');assert(route.steps.some(s=>s.edge.road.type==='motorway_link'),'must physically use a mapped exit ramp');
console.log(`Marina → Dubai Mall verified: ${(route.length/1000).toFixed(2)} km, ${route.steps.length} continuous segments, ${(performance.now()-start).toFixed(1)} ms route calculation in Node. Source corridor: ${world.roads.length} ways.`);
