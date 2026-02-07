const http = require('http');
function req(m,p,b,t){return new Promise((res,rej)=>{const o={hostname:'localhost',port:3001,path:p,method:m,headers:{'Content-Type':'application/json'}};if(t)o.headers.Authorization='Bearer '+t;const r=http.request(o,rs=>{let d='';rs.on('data',c=>d+=c);rs.on('end',()=>res(JSON.parse(d)))});r.on('error',rej);if(b)r.write(JSON.stringify(b));r.end()});}
async function main(){
  const l=await req('POST','/api/auth/login',{email:'admin@yourcompany.com',password:'TestPass123!'});
  const t=l.data.accessToken;

  // Test warranty for SM-T54W (product 9924) with null price
  console.log('=== Product 9924 (SM-T54W) with no price ===');
  const w1 = await req('GET','/api/warranty/eligible/9924',null,t);
  console.log('Eligible:', w1.eligible, 'Warranties:', w1.warranties?.length);
  if (w1.eligible === false) console.log('Reason:', w1.reason || 'N/A');

  // Test with price=0
  console.log('\n=== Product 9924 with price=0 ===');
  const w2 = await req('GET','/api/warranty/eligible/9924?price=0',null,t);
  console.log('Eligible:', w2.eligible, 'Warranties:', w2.warranties?.length);

  // Test with a reasonable price
  console.log('\n=== Product 9924 with price=299 ===');
  const w3 = await req('GET','/api/warranty/eligible/9924?price=299',null,t);
  console.log('Eligible:', w3.eligible, 'Warranties:', w3.warranties?.length);

  // Test batch with price=0 (what POS sends when unitPrice is 0)
  console.log('\n=== Batch with price=0 ===');
  const b1 = await req('POST','/api/warranty/eligible',{products:[{productId:9924,price:0}]},t);
  console.log('Results:', JSON.stringify(b1.results?.map(r => ({eligible: r.eligible, count: r.warranties?.length, reason: r.reason}))));

  // Test batch with no price
  console.log('\n=== Batch with no price ===');
  const b2 = await req('POST','/api/warranty/eligible',{products:[{productId:9924}]},t);
  console.log('Results:', JSON.stringify(b2.results?.map(r => ({eligible: r.eligible, count: r.warranties?.length, reason: r.reason}))));
}
main().catch(console.error);
