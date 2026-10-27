// Dubai Municipality's documented public SOAP service. No credentials, scraping,
// bulk enumeration, or persistent storage of address queries are required.
const endpoint='https://www.makani.ae/MakaniPublicDataService/MakaniPublic.svc/basic';
export async function resolveMakani(number,fetcher=fetch){
  const digits=String(number).replace(/\s/g,'');if(!/^\d{10}$/.test(digits))throw Error('Enter the ten digits printed on the Makani entrance plate.');
  const formatted=digits.slice(0,5)+' '+digits.slice(5);
  const body=`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetMakaniDetails xmlns="http://tempuri.org/"><makanino>${formatted}</makanino><remarks>Dubai Drive address lookup</remarks></GetMakaniDetails></s:Body></s:Envelope>`;
  const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8','SOAPAction':'"http://tempuri.org/IMakaniPublic/GetMakaniDetails"'},body,signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Dubai Municipality entrance service is unavailable. Try a mapped building name.');
  const text=await response.text(),match=text.match(/<(?:\w+:)?GetMakaniDetailsResult[^>]*>([\s\S]*?)<\/(?:\w+:)?GetMakaniDetailsResult>/);
  if(!match)throw Error('The Makani service returned an unexpected response.');
  const decoded=match[1].replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
  const raw=JSON.parse(decoded),info=raw.MAKANI_INFO?.find(x=>x.EMIRATE_E?.toUpperCase()==='DUBAI')||raw.MAKANI_INFO?.[0];
  if(!info?.LATLNG)throw Error('That Makani number could not be resolved to a building entrance.');
  const [lat,lon]=info.LATLNG.split(',').map(Number);if(!Number.isFinite(lat)||!Number.isFinite(lon))throw Error('Invalid coordinate returned by Makani.');
  return{source:'Dubai Municipality',sourceUrl:'https://www.dm.gov.ae/open-data2/open-data-for-makani/',makani:raw.MAKANI||formatted,name:info.BLDG_NAME_E||`Makani ${formatted}`,entrance:info.ENT_NAME_E||'',community:info.COMMUNITY_E||'',lat,lon,retrieved:new Date().toISOString()};
}
