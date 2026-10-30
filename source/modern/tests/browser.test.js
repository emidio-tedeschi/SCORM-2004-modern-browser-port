// Real Chromium integration; local fake LMS is a fixture, not a conformance oracle.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../dist');
const mock=`window.calls=[];let state='new',error='0',values={};window.API_1484_11={version:'1.0',Initialize(p){calls.push(['Initialize',p]);if(p!==''){error='201';return 'false'}if(state==='active'){error='103';return 'false'}state='active';error='0';return 'true'},Terminate(p){calls.push(['Terminate',p]);if(state!=='active'){error='112';return 'false'}state='ended';error='0';return 'true'},Commit(p){if(state!=='active'){error='142';return 'false'}error=p?'201':'0';return p?'false':'true'},SetValue(p,v){if(state!=='active'){error='132';return 'false'}if(!p){error='351';return 'false'}values[p]=v;error='0';return 'true'},GetValue(p){if(state!=='active'){error='122';return ''}if(!p){error='301';return ''}error='0';return values[p]||''},GetLastError(){return error},GetErrorString(p){return ['0','402'].includes(p)?'Error text':''},GetDiagnostic(p){return 'Diagnostic'}};`;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://local');
 if(u.pathname==='/host'){res.setHeader('Content-Type','text/html');res.end('<script>'+mock+'</script><iframe style="width:1200px;height:1100px" src="'+u.searchParams.get('sco')+'"></iframe>');return;}
 const f=path.resolve(root,'.'+u.pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 let options={headless:true};
 if(process.env.SCORM_CHROMIUM_MODULE){const loaded=require(process.env.SCORM_CHROMIUM_MODULE);const bundle=loaded.default||loaded;options={...options,executablePath:await bundle.executablePath(),args:bundle.args};}
 const browser=await chromium.launch(options);let page;
 try{
  page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  async function load(name,activity){await page.goto(base+'/host?sco='+encodeURIComponent('/LMSTestPackage_API/resources/'+name+'?tc=API&act='+activity));const frame=page.frames()[1];await frame.waitForSelector('#modern-start');return frame;}
  async function start(f,run='browser-integration'){await f.fill('#modern-run',run);await f.fill('#modern-learner','42');await f.click('#modern-start');}
  let f=await load('AssetLaunchTest.htm','1');await start(f);
  assert.match(await f.locator('#modern-summary').innerText(),/INCOMPLETE/);assert.equal(await page.evaluate(()=>calls.length),0,'Asset must not initialize');
  // iframe-only navigation fires pagehide and preserves host origin storage.
  await f.goto(base+'/LMSTestPackage_API/resources/APIRTETest1.htm?tc=API&act=2');await start(f);
  assert.match(await f.locator('#modern-summary').innerText(),/visite 2\/3/);
  assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='Initialize').length),1);
  // A new launch resets LMS runtime state; the test harness progress persists.
  f=await load('APIRTETest2.htm','3');await start(f);
  assert.match(await f.locator('#modern-summary').innerText(),/API: PASS/);
  const report=await f.evaluate(()=>ADLModern.unpack(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('adl-modern:v1:')))));
  assert.equal(report.cursor,3);assert.equal(report.rows.filter(r=>r.id).length,30);
  const downloadPromise=page.waitForEvent('download');await f.click('#modern-export');const dl=await downloadPromise;assert.equal(dl.suggestedFilename(),'API-report.json');
  await page.screenshot({path:path.join(__dirname,'browser-smoke.png'),fullPage:true});
  // Wrong launch order cannot silently run activity 3 as activity 1.
  f=await load('APIRTETest2.htm','3');await start(f,'wrong-order');assert.match(await f.locator('#modern-summary').innerText(),/FAIL/);
  // Real original sequencing UI is still interactive, before the API calls.
  await page.goto(base+'/host?sco='+encodeURIComponent('/LMSTestPackage_CM-01/resources/SequencingTest.htm?tc=CM-01&act=1'));
  f=page.frames()[1];await start(f,'ui-inspection');
  assert.equal(await page.evaluate(()=>calls.length),0);
  await f.check('#tRadio0');await f.check('#fRadio1');await f.check('#fRadio2');await f.click('#submit');
  assert.match(await f.locator('#modern-summary').innerText(),/visite 1\/7/);
  // Large DMI activity: verifies thousands of original commands and compressed persistence.
  await page.goto(base+'/host?sco='+encodeURIComponent('/LMSTestPackage_DMI/resources/DMImplementationTest1.htm?tc=DMI&act=1'));
  f=page.frames()[1];await start(f,'dmi-wiring');
  const dmi=await f.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.includes('dmi-wiring'));return ADLModern.unpack(localStorage.getItem(k));});
  assert.equal(dmi.rows.filter(r=>r.id).length,966);assert.equal(dmi.cursor,1);
  assert.equal(dmi.rows.filter(r=>r.status==='BLOCKED').length,0);
  await page.goto(base+'/host?sco='+encodeURIComponent('/LMSTestPackage_DMI/resources/DMImplementationTest2.htm?tc=DMI&act=2'));
  f=page.frames()[1];await start(f,'dmi-wiring');
  const large=await f.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.includes('dmi-wiring'));return ADLModern.unpack(localStorage.getItem(k));});
  assert.equal(large.rows.filter(r=>r.id).length,4465);assert.equal(large.cursor,2);
  assert.equal(large.rows.filter(r=>r.status==='BLOCKED').length,0);
  // Missing API is reported and never passed.
  await page.goto(base+'/LMSTestPackage_API/resources/APIRTETest1.htm?tc=API&act=2');await page.fill('#modern-run','missing-api');await page.fill('#modern-learner','42');
  await page.evaluate(()=>{const k='adl-modern:v1:'+ADL_DATA.sourceCommit+':missing-api:42:API';localStorage.setItem(k,JSON.stringify({cursor:1,rows:[],config:{run:'missing-api',learnerId:'42'}}));});
  page.on('dialog',d=>d.dismiss());await page.click('#modern-start');assert.match(await page.locator('#modern-summary').innerText(),/BLOCKED/);
  assert.deepEqual(errors,[]);console.log('PASS: Chromium asset, API activities, persistence, export, wrong-order and missing-API cases');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
