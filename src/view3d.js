import * as T from '../vendor/three.module.js';
import {clamp} from './network.js';
import {signalPhase} from './signals.js';

export class DriveView {
  dispose(){this.scene.traverse(object=>{object.geometry?.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials){if(material){material.map?.dispose();material.dispose()}}});this.renderer.dispose();this.resizeHandler&&removeEventListener('resize',this.resizeHandler)}
  constructor(canvas,world){
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;
    this.scene=new T.Scene();this.scene.background=new T.Color('#bdccd1');this.scene.fog=new T.Fog('#bdccd1',240,1550);
    this.camera=new T.PerspectiveCamera(68,1,.04,2200);this.scene.add(this.camera);
    this.scene.add(new T.HemisphereLight('#d9ecff','#b5a083',1.6));
    this.sun=new T.DirectionalLight('#fff1d9',2.2);this.sun.position.set(-180,260,100);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-95,right:95,top:95,bottom:-95,near:1,far:650});this.sun.shadow.bias=-.0005;this.scene.add(this.sun);this.scene.add(this.sun.target);
    const ground=new T.Mesh(new T.PlaneGeometry(16000,16000),new T.MeshStandardMaterial({color:'#baae94',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.13;ground.receiveShadow=true;this.scene.add(ground);
    this.world=world;this.nodeHeights=new Map();const h=new Map();
    for(const road of world.roads)for(const id of road.nodeIds){const y=road.bridge?Math.max(1,road.layer)*6:road.tunnel?-4:0;if(!h.has(id))h.set(id,[]);h.get(id).push(y)}
    for(const [id,ys]of h)this.nodeHeights.set(id,Math.max(...ys));
    this.buildRoads();this.buildBuildings();this.buildWater();this.buildSigns();this.buildSignals();
    this.player=this.carModel('#e5e8e5');this.scene.add(this.player);
    this.traffic=[];this.routeMesh=null;this.destination=null;this.follow=new T.Vector3();this.look=new T.Vector3();this.ready=false;this.cameraMode=0;this.lookBack=false;this.buildCockpit();
    this.resize();this.resizeHandler=()=>this.resize();addEventListener('resize',this.resizeHandler);
  }
  elevation(edge,t=0){return (this.nodeHeights.get(edge.from)||0)*(1-t)+(this.nodeHeights.get(edge.to)||0)*t}
  resize(){this.renderer.setSize(innerWidth,innerHeight,false);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix()}
  buildRoads(){
    const roadVertices=[],shoulderVertices=[],markVertices=[],barrierVertices=[];
    for(const road of this.world.roads){
      const half=road.lanes*3.5/2;
      for(let i=1;i<road.points.length-1;i++){const a=road.points[i-1],p=road.points[i],b=road.points[i+1],u=Math.atan2(p[0]-a[0],p[1]-a[1]),v=Math.atan2(b[0]-p[0],b[1]-p[1]);if(Math.abs(Math.atan2(Math.sin(v-u),Math.cos(v-u)))>.07){const y=this.nodeHeights.get(road.nodeIds[i])||0;disc(shoulderVertices,p,half+.7,y+.012);disc(roadVertices,p,half,y+.026)}}
      for(let i=1;i<road.points.length;i++){
        const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.1)continue;
        const ya=this.nodeHeights.get(road.nodeIds[i-1])||0,yb=this.nodeHeights.get(road.nodeIds[i])||0;
        ribbon(shoulderVertices,a,b,half+.7,ya+.01,yb+.01);
        ribbon(roadVertices,a,b,half,ya+.025,yb+.025);
        const heading=Math.atan2(dx,dz),nx=Math.cos(heading),nz=-Math.sin(heading);
        for(let lane=0;lane<=road.lanes;lane++){
          const offset=-half+lane*3.5,solid=lane===0||lane===road.lanes||(!road.oneway&&lane===Math.floor(road.lanes/2));
          const ax=a[0]+nx*offset,az=a[1]+nz*offset,bx=b[0]+nx*offset,bz=b[1]+nz*offset;
          if(solid)ribbon(markVertices,[ax,az],[bx,bz],.07,ya+.045,yb+.045);
          else for(let s=0;s<len;s+=10){const e=Math.min(s+4,len);ribbon(markVertices,[ax+(bx-ax)*s/len,az+(bz-az)*s/len],[ax+(bx-ax)*e/len,az+(bz-az)*e/len],.075,ya+(yb-ya)*s/len+.046,ya+(yb-ya)*e/len+.046)}
        }
        if(road.type==='motorway'||road.bridge){for(const sign of[-1,1]){
          const offset=(half+.55)*sign,aa=[a[0]+nx*offset,a[1]+nz*offset],bb=[b[0]+nx*offset,b[1]+nz*offset];
          wall(barrierVertices,aa,bb,ya+.15,yb+.15,.68);
        }}
      }
    }
    const asphalt=mesh(roadVertices,'#424647');asphalt.material.map=asphaltTexture();asphalt.geometry.setAttribute('uv',new T.Float32BufferAttribute(roadVertices.flatMap((v,i)=>i%3===0?[v*.2,roadVertices[i+2]*.2]:[]),2));
    this.scene.add(mesh(shoulderVertices,'#bcbab0'),asphalt,mesh(markVertices,'#ece9db'),mesh(barrierVertices,'#a9a99e'));
  }
  buildBuildings(){
    const vertices=[],colors=[];
    for(const building of this.world.buildings){
      const shape=new T.Shape();const p=building.points;shape.moveTo(p[0][0],-p[0][1]);for(let i=1;i<p.length;i++)shape.lineTo(p[i][0],-p[i][1]);
      const geo=new T.ExtrudeGeometry(shape,{depth:clamp(building.height,3,420),bevelEnabled:false,steps:1});geo.rotateX(-Math.PI/2);
      // Shape x/-north -> rotate gives world x/north: restore north sign.
      const position=geo.getAttribute('position');const color=new T.Color(['#a5a59c','#aab9bc','#c1b8a4','#8b9ea4','#c5c5b9'][Number(building.id.slice(1))%5]);
      for(let i=0;i<position.count;i++){vertices.push(position.getX(i),position.getY(i),-position.getZ(i));colors.push(color.r,color.g,color.b)}geo.dispose();
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
    const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.72,metalness:.12,side:T.DoubleSide});
    material.onBeforeCompile=shader=>{shader.vertexShader='varying vec3 vFacadePosition; varying vec3 vFacadeNormal;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFacadePosition = position; vFacadeNormal = normal;');shader.fragmentShader='varying vec3 vFacadePosition; varying vec3 vFacadeNormal;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      if (abs(vFacadeNormal.y) < 0.4 && vFacadePosition.y > 2.7) {
        float wallAxis = abs(vFacadeNormal.x) > 0.5 ? vFacadePosition.z : vFacadePosition.x;
        float column = mod(wallAxis + 20000.0, 2.2); float floorY = mod(vFacadePosition.y, 3.2);
        float windowMask = step(0.28,column) * step(column,1.85) * step(0.65,floorY) * step(floorY,2.65);
        vec3 glass = vec3(0.21,0.31,0.36) + vec3(0.05) * sin(floor(wallAxis/2.2)*2.0);
        diffuseColor.rgb = mix(diffuseColor.rgb,glass,windowMask * 0.85);
      }`)};
    const buildings=new T.Mesh(geo,material);buildings.castShadow=true;buildings.receiveShadow=true;this.buildingMesh=buildings;this.scene.add(buildings);
  }
  buildSigns(){
    const names=new Set();for(const road of this.world.roads){if(!road.name||names.has(road.name)||road.type==='service')continue;names.add(road.name);const p=road.points[Math.floor(road.points.length/2)],label=document.createElement('canvas');label.width=512;label.height=128;const c=label.getContext('2d');c.fillStyle='#24504c';c.fillRect(0,0,512,128);c.strokeStyle='#e3eee8';c.lineWidth=5;c.strokeRect(4,4,504,120);c.textAlign='center';c.fillStyle='#fff';c.font='24px sans-serif';c.fillText(road.nameAr||road.ref||'DUBAI',256,43);c.font='bold 22px sans-serif';c.fillText(road.name,256,88,480);const texture=new T.CanvasTexture(label),sign=new T.Sprite(new T.SpriteMaterial({map:texture}));sign.position.set(p[0]+road.lanes*1.75+2,3.3,-p[1]);sign.scale.set(8,2,1);this.scene.add(sign)}
  }
  buildSignals(){this.signals=[];for(const signal of this.world.signals||[]){const road=this.world.roads.find(r=>r.nodeIds.includes(signal.id));if(!road)continue;const i=Math.max(1,road.nodeIds.indexOf(signal.id)),a=road.points[i-1],b=road.points[i],heading=Math.atan2(b[0]-a[0],b[1]-a[1]),offset=road.lanes*1.75+1,x=signal.p[0]+Math.cos(heading)*offset,z=signal.p[1]-Math.sin(heading)*offset,y=this.nodeHeights.get(signal.id)||0;
      const post=new T.Mesh(new T.CylinderGeometry(.055,.065,3.4,6),new T.MeshStandardMaterial({color:'#727d77'}));post.position.set(x,y+1.7,-z);this.scene.add(post);const board=new T.Mesh(new T.BoxGeometry(.4,1.1,.25),new T.MeshStandardMaterial({color:'#171f20'}));board.position.set(x,y+3,-z);board.rotation.y=-heading;this.scene.add(board);
      const bulbs=[];for(let j=0;j<3;j++){const bulb=new T.Mesh(new T.SphereGeometry(.11,8,6),new T.MeshBasicMaterial({color:'#333'}));bulb.position.set(0,.34-j*.34,-.14);board.add(bulb);bulbs.push(bulb)}this.signals.push({bulbs,heading})
    }}
  buildWater(){for(const points of this.world.water||[]){const shape=new T.Shape(points.map(p=>new T.Vector2(p[0],p[1])));const geo=new T.ShapeGeometry(shape);geo.rotateX(-Math.PI/2);const water=new T.Mesh(geo,new T.MeshStandardMaterial({color:'#4b8c98',roughness:.27,metalness:.25,side:T.DoubleSide}));water.position.y=-.04;this.scene.add(water)}}
  carModel(color){
    const group=new T.Group(),paint=new T.MeshStandardMaterial({color,metalness:.35,roughness:.35}),glass=new T.MeshStandardMaterial({color:'#283c48',metalness:.45,roughness:.2});
    const part=(w,h,l,x,y,z,material)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,l),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m};
    part(1.82,.64,4.45,0,.61,0,paint);part(1.5,.65,2.12,0,1.2,.05,glass);part(1.54,.1,1.4,0,1.56,.1,paint);
    const tire=new T.MeshStandardMaterial({color:'#171b1e',roughness:.95});for(const x of[-.9,.9])for(const z of[-1.37,1.35]){const w=new T.Mesh(new T.CylinderGeometry(.34,.34,.22,10),tire);w.rotation.z=Math.PI/2;w.position.set(x,.35,z);w.castShadow=true;group.add(w)}
    const red=new T.MeshBasicMaterial({color:'#b72822'}),light=new T.MeshBasicMaterial({color:'#fff6d6'});for(const x of[-.62,.62]){part(.42,.15,.06,x,.78,2.24,red);part(.43,.15,.06,x,.78,-2.24,light)}
    const plate=new T.MeshBasicMaterial({color:'#deded5'});part(.48,.12,.02,0,.55,2.28,plate);
    group.userData.lights=red;return group;
  }
  buildCockpit(){
    const group=new T.Group();this.cockpit=group;this.camera.add(group);
    const dark=new T.MeshStandardMaterial({color:'#1b2226',roughness:.88}),trim=new T.MeshStandardMaterial({color:'#485257',roughness:.55,metalness:.35});
    const box=(w,h,d,x,y,z,material=dark)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);group.add(m);return m};
    box(2.7,.15,.75,.3,-.61,-1.02);box(2.7,.52,.36,.3,-.91,-.7);box(.7,.34,.4,.7,-.68,-.86);
    box(.1,1.45,.12,-1.02,.05,-1.13,trim).rotation.z=-.28;box(.1,1.45,.12,1.45,.05,-1.13,trim).rotation.z=.28;box(2.7,.09,.15,.25,.77,-1.1,trim);
    box(.12,.43,1.5,-1.05,-.72,-.05);box(.12,.43,1.5,1.45,-.72,-.05);
    const wheel=new T.Group();wheel.position.set(-.04,-.43,-.8);group.add(wheel);this.steeringWheel=wheel;
    const rim=new T.Mesh(new T.TorusGeometry(.255,.026,10,48),dark);wheel.add(rim);
    const hub=new T.Mesh(new T.BoxGeometry(.14,.12,.06),dark);hub.position.z=.01;wheel.add(hub);
    for(const rotation of[Math.PI/2,-Math.PI/2,Math.PI]){const spoke=new T.Mesh(new T.BoxGeometry(.027,.23,.025),trim);spoke.position.set(Math.sin(rotation)*.12,Math.cos(rotation)*.12,0);spoke.rotation.z=-rotation;wheel.add(spoke)}
    this.gaugeCanvas=document.createElement('canvas');this.gaugeCanvas.width=768;this.gaugeCanvas.height=256;this.gaugeContext=this.gaugeCanvas.getContext('2d');this.gaugeTexture=new T.CanvasTexture(this.gaugeCanvas);this.gaugeTexture.colorSpace=T.SRGBColorSpace;
    const gauges=new T.Mesh(new T.PlaneGeometry(.85,.285),new T.MeshBasicMaterial({map:this.gaugeTexture,toneMapped:false}));gauges.position.set(-.02,-.41,-1.035);group.add(gauges);
    const screenCanvas=document.createElement('canvas');screenCanvas.width=256;screenCanvas.height=128;const c=screenCanvas.getContext('2d');c.fillStyle='#102024';c.fillRect(0,0,256,128);c.fillStyle='#cfed9c';c.textAlign='center';c.font='18px sans-serif';c.fillText('DUBAI DRIVE',128,46);c.fillStyle='#a2b6ae';c.font='12px sans-serif';c.fillText('VOICE NAVIGATION',128,76);const texture=new T.CanvasTexture(screenCanvas);const screen=new T.Mesh(new T.PlaneGeometry(.47,.235),new T.MeshBasicMaterial({map:texture,toneMapped:false}));screen.position.set(.72,-.48,-.95);group.add(screen);
    for(let i=0;i<8;i++)box(.03,.08,.02,.49+i*.057,-.7,-.64,trim);
    this.rearCabin=new T.Group();this.camera.add(this.rearCabin);
    const rearPart=(w,h,d,x,y,z)=>{const part=new T.Mesh(new T.BoxGeometry(w,h,d),dark);part.position.set(x,y,z);this.rearCabin.add(part)};
    rearPart(2.7,.18,.4,0,-.73,-1);rearPart(2.7,.12,.12,0,.72,-1.1);rearPart(.15,1.4,.15,-1.05,0,-1.1);rearPart(.15,1.4,.15,1.05,0,-1.1);rearPart(.4,.28,.15,-.55,-.49,-1);rearPart(.4,.28,.15,.55,-.49,-1);
    this.gaugeKey='';
  }
  updateCockpit(car){this.steeringWheel.rotation.z=-car.steer*8;const speed=Math.round(Math.abs(car.speed)*3.6),gear=car.gear||'D',key=speed+':'+gear+':'+car.indicator;if(key===this.gaugeKey)return;this.gaugeKey=key;const c=this.gaugeContext;c.fillStyle='#080f13';c.fillRect(0,0,768,256);c.textAlign='center';c.fillStyle='#d7e8de';c.font='100px sans-serif';c.fillText(speed,380,148);c.font='22px sans-serif';c.fillStyle='#829b93';c.fillText('km/h',380,188);c.font='66px sans-serif';c.fillStyle=gear==='R'?'#ffc579':'#cfed9c';c.fillText(gear,635,143);c.font='18px sans-serif';c.fillText(gear==='R'?'REVERSE':'DRIVE',635,180);c.strokeStyle='#536f65';c.lineWidth=6;for(let i=0;i<19;i++){const a=Math.PI*.78+i*Math.PI*1.44/18,x=160+Math.cos(a)*81,y=127+Math.sin(a)*81;c.beginPath();c.moveTo(x,y);c.lineTo(160+Math.cos(a)*68,127+Math.sin(a)*68);c.stroke()}const a=Math.PI*.78+Math.min(1,speed/160)*Math.PI*1.44;c.strokeStyle='#cfed9c';c.lineWidth=5;c.beginPath();c.moveTo(160,127);c.lineTo(160+Math.cos(a)*65,127+Math.sin(a)*65);c.stroke();this.gaugeTexture.needsUpdate=true}
  setRoute(route){
    if(this.routeMesh){this.scene.remove(this.routeMesh);this.routeMesh.geometry.dispose();this.routeMesh.material.dispose()}
    const vertices=[];for(const step of route.steps){const e=step.edge,a=[e.a[0]+(e.b[0]-e.a[0])*step.start,e.a[1]+(e.b[1]-e.a[1])*step.start],b=[e.a[0]+(e.b[0]-e.a[0])*step.end,e.a[1]+(e.b[1]-e.a[1])*step.end];ribbon(vertices,a,b,.16,this.elevation(e,step.start)+.08,this.elevation(e,step.end)+.08)}
    this.routeMesh=mesh(vertices,'#99ca89',true);this.scene.add(this.routeMesh);
    if(this.destination)this.scene.remove(this.destination);
    this.destination=new T.Mesh(new T.CylinderGeometry(2.5,2.5,22,20,1,true),new T.MeshBasicMaterial({color:'#a8dfa7',transparent:true,opacity:.25,side:T.DoubleSide,depthWrite:false}));this.destination.position.set(route.end[0],11,-route.end[1]);this.scene.add(this.destination);
  }
  render(car,traffic,dt,edgeMatch,audioFirst,time=0){
    const y=edgeMatch?this.elevation(edgeMatch.edge,edgeMatch.t):0,cockpit=this.cameraMode===0,topdown=this.cameraMode===2;this.player.position.set(car.x,y,-car.z);this.player.rotation.y=-car.heading;this.player.visible=!cockpit;this.cockpit.visible=cockpit&&!this.lookBack;this.rearCabin.visible=cockpit&&this.lookBack;this.player.userData.lights.color.set(car.braking?'#ff2216':'#b72822');this.updateCockpit(car);
    while(this.traffic.length<traffic.length){const model=this.carModel(['#b8bec1','#c1b296','#5a6670','#a05b50','#e0ddd5'][this.traffic.length%5]);this.traffic.push(model);this.scene.add(model)}
    traffic.forEach((v,i)=>{const m=this.traffic[i];m.visible=v.visible!==false;m.position.set(v.x,this.elevation(v.edge,v.s/v.edge.length),-v.z);m.rotation.y=-v.heading;m.userData.lights.color.set(v.braking?'#ff2216':'#a62e26')});
    const target=cockpit?new T.Vector3(car.x-Math.cos(car.heading)*.36+Math.sin(car.heading)*.1,y+1.28,-car.z-Math.sin(car.heading)*.36-Math.cos(car.heading)*.1):topdown?new T.Vector3(car.x,y+440,-car.z+5):new T.Vector3(car.x-Math.sin(car.heading)*10,y+4.8,-car.z+Math.cos(car.heading)*10);
    if(!cockpit&&!topdown){const anchor=new T.Vector3(car.x,y+1.8,-car.z),direction=target.clone().sub(anchor),length=direction.length(),ray=new T.Raycaster(anchor,direction.normalize(),0,length);const hits=ray.intersectObject(this.buildingMesh);if(hits.length&&hits[0].distance<length)target.copy(anchor).addScaledVector(direction,Math.max(.7,hits[0].distance-.5))}
    const direction=this.lookBack?-1:1;const look=topdown?new T.Vector3(car.x,y,-car.z):cockpit?new T.Vector3(target.x+Math.sin(car.heading)*30*direction,y+1.05,target.z-Math.cos(car.heading)*30*direction):new T.Vector3(car.x+Math.sin(car.heading)*18,y+1.1,-car.z-Math.cos(car.heading)*18);
    if(!this.ready||cockpit){this.follow.copy(target);this.look.copy(look);this.ready=true}else{this.follow.lerp(target,1-Math.exp(-dt*5));this.look.lerp(look,1-Math.exp(-dt*6))}
    this.camera.position.copy(this.follow);this.camera.lookAt(this.look);this.sun.position.set(car.x-130,y+230,-car.z+90);this.sun.target.position.set(car.x,y,-car.z);this.sun.target.updateMatrixWorld();
    if(this.routeMesh)this.routeMesh.visible=!audioFirst;
    for(const s of this.signals){const phase=signalPhase(time,s.heading);s.bulbs.forEach((b,i)=>b.material.color.set(phase===['red','amber','green'][i]?['#f94d38','#ffc44d','#65e981'][i]:'#242b27'))}
    this.renderer.render(this.scene,this.camera);
  }
}

function ribbon(out,a,b,half,ya,yb){const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,nx=dz/len*half,nz=-dx/len*half;const p=[[a[0]+nx,ya,-a[1]-nz],[b[0]+nx,yb,-b[1]-nz],[b[0]-nx,yb,-b[1]+nz],[a[0]-nx,ya,-a[1]+nz]];for(const i of[0,1,2,0,2,3])out.push(...p[i])}
function disc(out,p,radius,y){for(let i=0;i<12;i++){const a=i*Math.PI/6,b=(i+1)*Math.PI/6;out.push(p[0],y,-p[1],p[0]+Math.cos(a)*radius,y,-p[1]+Math.sin(a)*radius,p[0]+Math.cos(b)*radius,y,-p[1]+Math.sin(b)*radius)}}
function wall(out,a,b,ya,yb,height){const p=[[a[0],ya,-a[1]],[b[0],yb,-b[1]],[b[0],yb+height,-b[1]],[a[0],ya+height,-a[1]]];for(const i of[0,1,2,0,2,3])out.push(...p[i])}
function mesh(vertices,color,basic=false){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeVertexNormals();const material=basic?new T.MeshBasicMaterial({color,side:T.DoubleSide}):new T.MeshStandardMaterial({color,roughness:.94,side:T.DoubleSide});const m=new T.Mesh(g,material);m.receiveShadow=!basic;return m}
function asphaltTexture(){const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const c=canvas.getContext('2d'),pixels=c.createImageData(128,128);let seed=29;for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const value=190+(seed%42);pixels.data[i]=value;pixels.data[i+1]=value;pixels.data[i+2]=value;pixels.data[i+3]=255}c.putImageData(pixels,0,0);const texture=new T.CanvasTexture(canvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.colorSpace=T.SRGBColorSpace;return texture}
