import assert from 'node:assert/strict';
import {resolveMakani} from '../src/makani-service.mjs';
import {buildWorld} from '../scripts/build-world.mjs';

const xml='<s:Envelope><s:Body><GetMakaniDetailsResult>{"MAKANI":"12922 75854","MAKANI_INFO":[{"EMIRATE_E":"DUBAI","BLDG_NAME_E":"","LATLNG":"25.0869,55.14499"}]}</GetMakaniDetailsResult></s:Body></s:Envelope>';
const entrance=await resolveMakani('12922 75854',async(url,options)=>{assert(url.startsWith('https://www.makani.ae/'));assert(options.body.includes('<makanino>12922 75854</makanino>'));return{ok:true,text:async()=>xml}});
assert.equal(entrance.source,'Dubai Municipality');assert.equal(entrance.lat,25.0869);await assert.rejects(resolveMakani('123',()=>{throw Error('must never query invalid number')}));
const raw='<osm><node id="1" lat="25.08" lon="55.14"/><node id="2" lat="25.081" lon="55.141"/><node id="3" lat="25.082" lon="55.142"/><way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="service"/><tag k="access" v="private"/></way><way id="11"><nd ref="2"/><nd ref="3"/><tag k="highway" v="residential"/><tag k="oneway" v="-1"/></way></osm>';
const world=buildWorld(raw);assert.equal(world.roads.length,1,'private access must be excluded');assert.equal(world.roads[0].nodeIds[0],'3','reverse one-way must reverse connectivity');assert(world.meta.bounds.minlat<world.meta.bounds.maxlat);console.log('Makani validation, source attribution, source XML conversion, private access and reverse one-way checks passed.');
