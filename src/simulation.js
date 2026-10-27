export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function stepVehicle(car,input,dt){
  const throttle=input.throttle?1:0, braking=input.brake?1:0;
  const direction=car.gear==='R'?-1:1;
  const magnitude=Math.abs(car.speed),drag=magnitude>0?.0018*magnitude*magnitude+.16:0;
  // Brake removes speed in either direction and can never cross through zero.
  // A direction change requires a deliberate gear selection while stopped.
  const acceleration=throttle?(direction<0?2.4:3.8):0;
  const next=Math.max(0,magnitude+(acceleration-braking*8.5-drag)*dt);
  car.speed=direction*clamp(next,0,direction<0?5:42);
  if(!throttle&&!braking&&Math.abs(car.speed)<.12)car.speed=0;
  const maxSteer=Math.min(.43/(1+Math.abs(car.speed)*.16),Math.atan(2.72*3.4/(car.speed*car.speed+1)));
  const target=input.steer*maxSteer;
  car.steer+=(target-car.steer)*Math.min(1,dt*4.5);
  const wheelbase=2.72;
  car.heading+=car.speed/wheelbase*Math.tan(car.steer)*dt;
  car.x+=Math.sin(car.heading)*car.speed*dt;
  car.z+=Math.cos(car.heading)*car.speed*dt;
  car.distance+=Math.abs(car.speed)*dt;
  return car;
}
export function selectGear(car,gear){if(!['D','R'].includes(gear))return false;if(Math.abs(car.speed)>.15)return false;car.speed=0;car.gear=gear;return true}
export function closestRoad(point,roads){let best={distance:Infinity,road:null,t:0,point:null};for(const road of roads){for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],vx=b[0]-a[0],vz=b[1]-a[1],l=vx*vx+vz*vz||1,t=clamp(((point.x-a[0])*vx+(point.z-a[1])*vz)/l,0,1),x=a[0]+vx*t,z=a[1]+vz*t,d=Math.hypot(point.x-x,point.z-z);if(d<best.distance)best={distance:d,road,t,point:[x,z],segment:i-1};}}return best}
export function trafficStep(vehicle,lead,dt){const target=vehicle.targetSpeed;let accel=clamp((target-vehicle.speed)*.45,-3.5,2.2);if(lead){const gap=lead.s-vehicle.s-4.7;const desired=7+vehicle.speed*1.35;if(gap<desired)accel-=Math.min(7,(desired-gap)*.72)}vehicle.speed=clamp(vehicle.speed+accel*dt,0,target+1);vehicle.s+=vehicle.speed*dt;return vehicle}
export function rectanglesOverlap(a,b){return Math.abs(a.x-b.x)<(a.w+b.w)/2&&Math.abs(a.z-b.z)<(a.l+b.l)/2}
export function pathLength(points){let total=0;for(let i=1;i<points.length;i++)total+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);return total}
export function projectToPath(point,points){let travelled=0,best={distance:Infinity,progress:0,lateral:0,point:null,heading:0,segment:0};for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,t=clamp(((point.x-a[0])*dx+(point.z-a[1])*dz)/(len*len),0,1),x=a[0]+dx*t,z=a[1]+dz*t,rx=point.x-x,rz=point.z-z,d=Math.hypot(rx,rz);if(d<best.distance){const cross=dx*rz-dz*rx;best={distance:d,progress:travelled+len*t,lateral:Math.sign(cross)*d,point:[x,z],heading:Math.atan2(dx,dz),segment:i-1}}travelled+=len}best.total=travelled;best.remaining=Math.max(0,travelled-best.progress);return best}
export function orientedBoxesOverlap(a,b){const axes=[[Math.cos(a.heading),-Math.sin(a.heading)],[Math.sin(a.heading),Math.cos(a.heading)],[Math.cos(b.heading),-Math.sin(b.heading)],[Math.sin(b.heading),Math.cos(b.heading)]];for(const axis of axes){const ca=a.x*axis[0]+a.z*axis[1],cb=b.x*axis[0]+b.z*axis[1],ra=Math.abs((a.width/2)*axis[0]*Math.cos(a.heading)-(a.width/2)*axis[1]*Math.sin(a.heading))+Math.abs((a.length/2)*axis[0]*Math.sin(a.heading)+(a.length/2)*axis[1]*Math.cos(a.heading)),rb=Math.abs((b.width/2)*axis[0]*Math.cos(b.heading)-(b.width/2)*axis[1]*Math.sin(b.heading))+Math.abs((b.length/2)*axis[0]*Math.sin(b.heading)+(b.length/2)*axis[1]*Math.cos(b.heading));if(Math.abs(ca-cb)>ra+rb)return false}return true}
