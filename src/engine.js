import {buildNetwork,routeBetween,routeProjection,nearestEdge,edgePosition,permitted,clamp,distance,angle,maneuver,pointInPolygon} from './network.js';
import {stepVehicle,orientedBoxesOverlap} from './simulation.js';
import {signalPhase} from './signals.js';

export class DrivingEngine{
  constructor(world){this.world=world;this.net=buildNetwork(world);this.signalNodes=new Set((world.signals||[]).map(s=>s.id));this.car={x:0,z:0,speed:0,steer:0,heading:0,distance:0,width:1.82,length:4.45};this.traffic=[];this.events=[];this.time=0;this.lastReroute=-10;this.lastCollision=-10;this.score=100;this.incidents=0;this.running=false;this.route=null;this.state='preview';this.input={throttle:false,brake:false,steer:0};this.randomSeed=7243}
  random(){this.randomSeed=(this.randomSeed*1664525+1013904223)>>>0;return this.randomSeed/4294967296}
  calculate(from,to){return routeBetween(this.net,from.p,to.p)}
  start(from,to,route=this.calculate(from,to)){
    if(!route||route.length<10)throw Error('Choose two distinct reachable places inside the loaded area.');
    this.from=from;this.to=to;this.route=route;this.initialLength=route.length;const step=route.steps[0],p=edgePosition(step.edge,step.start*step.edge.length,0);
    Object.assign(this.car,p,{speed:0,steer:0,distance:0,indicator:null,braking:false,gear:'D'});this.score=100;this.incidents=0;this.time=0;this.lastReroute=-10;this.lastCollision=-10;this.offroad=0;this.offroute=0;this.state='driving';this.running=true;this.events=[];this.match=nearestEdge(this.net,[p.x,p.z],p.heading);this.traffic=[];this.seedTraffic();this.position=routeProjection(route,[p.x,p.z]);this.next=maneuver(route,0);this.emit('start',`Drive toward ${to.name}. Follow the mapped road.`);return route
  }
  seedTraffic(){
    const nearby=this.net.edges.filter(e=>distance(e.a,[this.car.x,this.car.z])<850&&e.length>15);
    for(let i=0;i<32&&nearby.length;i++){const edge=nearby[Math.floor(this.random()*nearby.length)],s=this.random()*edge.length,lanes=this.lanes(edge),lane=Math.floor(this.random()*lanes),p=edgePosition(edge,s,lane);if(distance([p.x,p.z],[this.car.x,this.car.z])<20)continue;this.traffic.push({edge,s,lane,laneFloat:lane,targetLane:lane,speed:edge.road.maxspeed/3.6*(.55+.3*this.random()),desired:edge.road.maxspeed/3.6*(.65+.25*this.random()),width:1.82,length:4.5,...p,visible:true,wait:0,choice:i})}
  }
  lanes(e){return Math.max(1,e.road.oneway?e.road.lanes:Math.floor(e.road.lanes/2))}
  emit(type,text){this.events.push({type,text,time:this.time});if(this.events.length>20)this.events.shift()}
  update(dt){
    if(!this.running||!this.route)return;
    this.time+=dt;this.car.braking=this.input.brake;const oldX=this.car.x,oldZ=this.car.z;stepVehicle(this.car,this.input,dt);
    const p=[this.car.x,this.car.z];this.match=nearestEdge(this.net,p,this.car.heading);this.position=routeProjection(this.route,p);this.next=maneuver(this.route,this.position.index);
    const half=this.match.edge.road.lanes*3.5/2+1;
    if(this.match.distance>half){this.offroad+=dt;this.car.speed*=Math.exp(-dt*1.8);if(this.offroad>1)this.score=Math.max(0,this.score-dt*.8);const building=this.world.buildings.find(b=>distance(b.p,p)<250&&pointInPolygon(p,b.points));if(building){this.car.x=oldX;this.car.z=oldZ;this.car.speed=0;if(this.time-this.lastCollision>2){this.lastCollision=this.time;this.score=Math.max(0,this.score-10);this.incidents++;this.emit('collision','Road departure and building contact. Brake before attempting to return to the road.')}}}else this.offroad=0;
    if(this.car.speed*3.6>this.match.edge.road.maxspeed+8)this.score=Math.max(0,this.score-dt*.18);
    this.updateTraffic(dt);
    const routeEdges=new Set(this.route.steps.map(s=>s.edge.id));
    const deviated=this.position.distance>Math.max(14,half+4)||(!routeEdges.has(this.match.edge.id)&&this.match.distance<half&&this.position.distance>7);
    this.offroute=deviated?this.offroute+dt:0;
    if(this.car.gear!=='R'&&this.offroute>1.5&&this.time-this.lastReroute>(this.state==='no-route'?30:5)&&this.match.distance<half+3){
      this.lastReroute=this.time;const reroute=routeBetween(this.net,p,this.to.p,this.car.heading);
      if(reroute){this.route=reroute;this.state='rerouted';this.initialLength=reroute.length;this.offroute=0;this.emit('reroute','Route changed. Continue safely. New directions are ready.')}else{this.state='no-route';this.emit('no-route','No legal route to the destination inside the loaded map. Continue safely or choose a new destination.')}
    }
    if(distance(p,this.route.end)<9&&Math.abs(this.car.speed)<1.5&&this.position.s>this.route.length-18){this.state='arrived';this.running=false;this.emit('arrive',`You have reached the mapped road access for ${this.to.name}.`)}
  }
  updateTraffic(dt){
    for(const v of this.traffic){
      let lead=null,gap=Infinity;
      for(const other of this.traffic){if(other===v||!other.visible||Math.abs(other.laneFloat-v.laneFloat)>.65)continue;let d=Infinity;if(other.edge.id===v.edge.id)d=other.s-v.s;else if(v.edge.to===other.edge.from)d=v.edge.length-v.s+other.s;if(d>0&&d<gap){gap=d;lead=other}}
      if(this.match?.edge.id===v.edge.id){const cp=(this.car.x-v.edge.a[0])*Math.sin(v.edge.heading)+(this.car.z-v.edge.a[1])*Math.cos(v.edge.heading),side=(this.car.x-v.x)*Math.cos(v.heading)-(this.car.z-v.z)*Math.sin(v.heading);if(cp>v.s&&cp-v.s<gap&&Math.abs(side)<2){gap=cp-v.s;lead=this.car}}
      const signal=this.signalNodes.has(v.edge.to)?signalPhase(this.time,v.edge.heading):null;
      if(signal==='red'||signal==='amber'){const d=v.edge.length-v.s+2;if(d<gap){gap=d;lead={speed:0}}}
      const desired=Math.min(v.desired,v.edge.road.maxspeed/3.6),safe=7+v.speed*1.35,clearance=gap-4.5;
      let a=2*(1-(v.speed/Math.max(3,desired))**4);if(lead){const approach=v.speed-lead.speed,sstar=Math.max(3,safe+v.speed*approach/(2*Math.sqrt(2*3)));a-=2*(sstar/Math.max(.5,clearance))**2}
      a=clamp(a,-8,2);v.braking=a<-.8;v.speed=Math.max(0,v.speed+a*dt);
      // Attempt gradual lane changes only when both front and rear gaps permit.
      if(lead&&clearance<safe&&this.lanes(v.edge)>1&&v.wait<=0){const candidate=v.lane===0?1:v.lane-1,blocked=this.traffic.some(o=>o!==v&&o.edge.id===v.edge.id&&Math.abs(o.laneFloat-candidate)<.65&&Math.abs(o.s-v.s)<Math.max(16,v.speed*1.6));if(!blocked){v.targetLane=candidate;v.wait=7}}
      v.wait=Math.max(0,v.wait-dt);v.laneFloat+=(v.targetLane-v.laneFloat)*Math.min(1,dt*.8);if(Math.abs(v.laneFloat-v.targetLane)<.03)v.lane=v.targetLane;
      if(!v.visible){this.recycleVehicle(v);continue}
      v.s+=v.speed*dt;
      if(v.s>=v.edge.length){const choices=(this.net.adj.get(v.edge.to)||[]).filter(e=>permitted(this.net,v.edge,e)&&e.to!==v.edge.from);if(choices.length){const next=choices[Math.floor(this.random()*choices.length)];v.s-=v.edge.length;v.edge=next;v.lane=clamp(v.lane,0,this.lanes(next)-1);v.targetLane=v.lane;v.laneFloat=v.lane}else{v.speed=0;v.s=v.edge.length;v.visible=false;continue}}
      Object.assign(v,edgePosition(v.edge,v.s,v.laneFloat));
      const vertical=Math.abs((v.edge.road.layer||0)-(this.match?.edge.road.layer||0));
      if(v.visible&&vertical===0&&orientedBoxesOverlap(this.car,v)&&this.time-this.lastCollision>2){this.car.speed*=.15;v.speed*=.4;this.lastCollision=this.time;this.score=Math.max(0,this.score-15);this.incidents++;this.emit('collision','Collision. Slow down and leave more clearance before changing lanes.')}
      if(distance([v.x,v.z],[this.car.x,this.car.z])>1200){v.visible=false}
    }
  }
  recycleVehicle(v){if(this.time<(v.nextSpawn||0))return;v.nextSpawn=this.time+3+this.random()*2;const candidates=this.net.edges.filter(e=>{const d=distance(e.a,[this.car.x,this.car.z]);return d>160&&d<650&&e.length>20});if(!candidates.length)return;const edge=candidates[Math.floor(this.random()*candidates.length)],lane=Math.floor(this.random()*this.lanes(edge)),s=Math.min(edge.length*.5,10),p=edgePosition(edge,s,lane);if(this.traffic.some(o=>o!==v&&o.visible&&distance([o.x,o.z],[p.x,p.z])<18))return;Object.assign(v,{edge,s,lane,laneFloat:lane,targetLane:lane,speed:edge.road.maxspeed/3.6*.65,desired:edge.road.maxspeed/3.6*(.65+.2*this.random()),visible:true,wait:0,...p})}
}
