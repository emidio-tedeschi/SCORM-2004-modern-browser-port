/* Browser-side replacement for the ADL Java applet/LiveConnect transport. */
'use strict';
var IE=false, driver=null, LMSDriver=null, lmsReturned=null;
var _INFO=0,_WARNING=1,_PASSED=2,_FAILED=3,_TERMINATE=4,_CONFORMANT=5,_OTHER=9;
var _DETAILED_LOG='Detailed',_SUMMARY_LOG='Summary',_BOTH_LOG='Both';
function DetectBrowser(){IE=false;}
let modern=null;
function initLMSDriver(){LMSDriver=modern.adapter;}
function setScoStatus(s){modern.scoStatus=s;}
function getScoStatus(){return modern.scoStatus;}
function getAPIHandle(){return modern.api||(modern.api=ADLModern.findAPI(window));}
function getAPI(){return getAPIHandle();}
function findAPI(w){return ADLModern.findAPI(w);}
function terminateTest(){modern.adapter.terminateTest();}
function handleAPINotFound(){modern.add({status:'BLOCKED',note:'API_1484_11 inaccessible: launch through the LMS, check iframe origin/sandbox.'});terminateTest();}
function writeLogEntry(log,type,msg){modern.adapter.writeToLog(log,type,msg);}
function testSCOLaunch(){return modern.adapter.evalID(new URLSearchParams(location.search).get('tc')+'!'+new URLSearchParams(location.search).get('act'));}
function modernCall(method,args) {
  const api=getAPIHandle();
  if(typeof api?.[method]!=='function')throw Error('API_1484_11.'+method+' not found');
  const value=api[method](...args);lmsReturned=value;
  if(typeof value!=='string')modern.add({status:'FAIL',method,note:'API returned '+typeof value+' instead of string'});
  if(method==='Terminate' && value==='true')modern.terminated=true;
  return value;
}
function doInitialize(p){return modernCall('Initialize',[p]);}
function doCommit(p){return modernCall('Commit',[p]);}
function doGetValue(p){return modernCall('GetValue',[p]);}
function doSetValue(p,v){return modernCall('SetValue',[p,v]);}
function doGetLastError(){return modernCall('GetLastError',[]);}
function doGetErrorString(p){return modernCall('GetErrorString',[p]);}
function doGetDiagnostic(p){return modernCall('GetDiagnostic',[p]);}
function doTerminate(p){
  modern.save();
  const v=modernCall('Terminate',[p]);const error=modernCall('GetLastError',[]);
  modern.add({status:v==='true'&&error==='0'?'PASS':'FAIL',method:'Terminate',args:[p],actual:v,error,expected:'true',expectedError:'0',note:'Page lifecycle call, outside scenario commands'});
  modern.finish(false);return v;
}
function callTerminate(){return doTerminate('');}
function printDate(){modern.add({status:'INFO',note:new Date().toISOString()});}
function modernBoot(){
  const D=window.ADL_DATA, C=ADLModern, testcase=D.case;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state=null,key='',step=null,stepIndex=-1,active=false,commandsDone=false,uiDone=false,advanced=false,exited=false;
  const token=Date.now()+'-'+Math.random().toString(36).slice(2);
  const panel=document.createElement('section');panel.id='modern-panel';
  panel.innerHTML='<h2>SCORM 2004 • Browser port 0.1</h2><p>Porting sperimentale ADL — test LMS, nessuna attestazione di conformità. Usa un discente di test e una sola scheda di esecuzione.</p><label>Sessione di test <input id="modern-run" value="" placeholder="es. smartfad-test-01"></label> <label>ID discente atteso <input id="modern-learner" placeholder="ID SCORM, non username"></label> <button id="modern-start">Avvia / continua</button> <button id="modern-load">Carica solo log</button> <button id="modern-export">Esporta JSON</button> <button id="modern-show">Mostra log</button><p id="modern-summary" role="status">Pronto. Avvia il corso dalla piattaforma.</p><details><summary>Istruzioni iniziali ADL</summary><div id="modern-instructions"></div></details><pre id="modern-log" hidden></pre>';
  document.body.prepend(panel);
  const style=document.createElement('style');style.textContent='body{width:auto!important;max-width:1100px}#modern-panel{font:15px/1.5 system-ui;background:#eef4f7;color:#122638;border:1px solid #aac1cf;border-radius:12px;padding:20px;margin:12px;max-width:1100px}#modern-panel h2{margin-top:0}#modern-panel input,#modern-panel button{font:inherit;padding:7px;margin:4px;border:1px solid #91a8ba;border-radius:5px}#modern-panel button{cursor:pointer;background:white}#modern-log{white-space:pre-wrap;overflow-wrap:anywhere;max-height:450px;overflow:auto}';document.head.append(style);
  const el=id=>document.getElementById('modern-'+id);
  function render(){if(!state)return;const s=C.summary(state,testcase.steps.length);el('summary').textContent=`${testcase.name}: ${s.status} • visite ${s.completedVisits}/${s.totalVisits} • PASS ${s.counts.PASS}, FAIL ${s.counts.FAIL}, REVIEW ${s.counts.REVIEW}, BLOCKED ${s.counts.BLOCKED}`;if(!el('log').hidden)el('log').textContent=JSON.stringify(state.rows,null,2);}
  function save(){if(!state)return;try{const live=C.unpack(localStorage.getItem(key));if(live?.owner && live.owner!==token)throw Error('Un’altra scheda usa questa sessione/pacchetto.');localStorage.setItem(key,C.pack(state));}catch(e){modern.scoStatus='terminated';el('summary').textContent='BLOCKED: salvataggio log non disponibile: '+e;throw e;}render();}
  function add(row){if(!state)return;state.rows.push({at:new Date().toISOString(),visit:step?.key||null,...row});render();}
  function textResource(which,key){
    if(!key)return '';
    const [name,...vars]=key.split('~');let result=D.vocabulary[which][name];
    if(result===undefined){add({status:'REVIEW',note:'Unresolved instruction '+key});return escape(key);}
    for(const value of vars)result=result.replace('%s',()=>escape(value));return result;
  }
  function finish(departure){
    if(!active||advanced||!step)return;
    if(!commandsDone||!uiDone){if(departure){add({status:'BLOCKED',note:'Activity left before commands/UI checks completed'});save();}return;}
    const asset=location.pathname.endsWith('AssetLaunchTest.htm');
    if(!modern.terminated&&!asset){if(departure){add({status:'REVIEW',note:'Activity departed without observed successful Terminate'});}else return;}
    if(asset&&!departure)return;
    state.cursor=stepIndex+1;advanced=true;state.owner=null;save();
  }
  const adapter={
    evalID(id){
      const [name,activity]=id.split('!');stepIndex=state.cursor;step=testcase.steps[stepIndex];
      if(name!==testcase.name||!step||step.activity!==activity){add({status:'FAIL',note:`Unexpected launch ${id}; expected ${testcase.name}!${step?.activity||'END'}`});modern.scoStatus='terminated';save();return false;}
      commandsDone=step.commands.length===0;uiDone=!step.UIQ;
      add({status:'PASS',note:'Activity launch matches '+step.key});
      if(/OnUnload|SingleDoTerminate|SX09/.test(location.pathname))add({status:'REVIEW',note:'Legacy unload/post-termination scenario: browser lifecycle parity requires validation'});
      if(testcase.meta.end==='endUserInter')add({status:'REVIEW',note:'Confirm externally that the LMS sequencing session ended, as required by ADL'});
      save();return true;
    },
    runCommands(){
      if(!step||modern.scoStatus==='terminated')return false;
      if(commandsDone)return true;
      const facade={};for(const m of ['Initialize','Terminate','Commit','GetValue','SetValue','GetLastError','GetErrorString','GetDiagnostic'])facade[m]=(...args)=>modernCall(m,args);
      for(const source of step.commands){
        if(source.repair)add({id:source.id,status:'REVIEW',note:source.repair,source:source.originalRaw});
        try{const row=C.execute(facade,C.decode(source.raw,D.vocabulary.Commands),state.config);add({id:source.id,...row});}
        catch(e){add({id:source.id,status:'BLOCKED',note:String(e)});modern.scoStatus='terminated';break;}
      }
      commandsDone=true;save();return !state.rows.some(r=>r.visit===step.key&&['FAIL','BLOCKED'].includes(r.status));
    },
    getUITestQuestions(){
      if(!step?.UIQ)return '';
      return step.UIQ.split('~').map(raw=>{
        if(!raw.includes('@'))return textResource('UserInterface',raw);
        const [key,arg]=raw.split('@');const dot=arg.indexOf('.');
        return textResource('UserInterface',(dot<0?key:key+arg.slice(dot))+'~'+(dot<0?arg:arg.slice(0,dot)));
      }).join('~');
    },
    evaluateUIResults(answers){const ok=answers===step.UIA;uiDone=true;add({status:ok?'PASS':'FAIL',method:'UI inspection',expected:step.UIA,actual:answers});save();finish(false);return ok;},
    curUserInstructions(){return textResource('Instructions',step?.CUI||'');},
    completed(){/* The pagehide listener runs this after original unload actions. */},
    setSCOStatus(s){modern.scoStatus=s;},getScoStatus(){return modern.scoStatus;},
    writeToLog(log,type,msg){add({status:type===3?'FAIL':type===2?'PASS':type===4?'BLOCKED':type===1?'REVIEW':'INFO',note:msg});save();},
    terminateTest(){modern.scoStatus='terminated';add({status:'BLOCKED',note:'Original ADL page stopped the test'});save();},
    alertFailure(){add({status:'FAIL',note:'Unexpected resource launched'});save();},failed(){add({status:'FAIL',note:'ADL page failure'});save();}
  };
  modern={api:null,adapter,scoStatus:'running',terminated:false,add,save,finish};
  // Original pages obtain their driver from these DOM IDs; no global DOM interception.
  for(const id of ['NNLMSTestSCODriver','LMSTestSCODriver','NNLMSTestCODriver','LMSTestCODriver']){const node=document.createElement('div');node.id=id;node.hidden=true;Object.assign(node,adapter);document.body.append(node);}
  LMSDriver=adapter;
  el('instructions').innerHTML=textResource('Instructions',testcase.meta.purpose)+'<p>Start: '+escape(testcase.meta.start)+'</p>'+testcase.meta.TT.split('~').map(k=>textResource('Instructions',k)).join('');
  el('show').onclick=()=>{el('log').hidden=!el('log').hidden;render();};
  el('load').onclick=()=>{
    if(active)return;
    try{const run=el('run').value.trim(),learnerId=el('learner').value.trim();
      key='adl-modern:v1:'+D.sourceCommit+':'+encodeURIComponent(run)+':'+encodeURIComponent(learnerId)+':'+testcase.name;
      state=C.unpack(localStorage.getItem(key));if(!state)throw Error('Nessun log per questa sessione/ID/pacchetto.');render();
    }catch(e){el('summary').textContent=String(e);}
  };
  el('export').onclick=()=>{
    if(!state){el('summary').textContent='Avvia o carica una sessione prima di esportare.';return;}
    const report={schema:'adl-modern-report/1',portVersion:D.portVersion,sourceCommit:D.sourceCommit,package:testcase.name,summary:C.summary(state,testcase.steps.length),...state};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=testcase.name+'-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  el('start').onclick=()=>{
    if(active)return;
    try{
      const run=el('run').value.trim(),learnerId=el('learner').value.trim();
      if(!run||!learnerId)throw Error('Inserisci sessione e ID discente atteso. Usa gli stessi valori a ogni lancio del pacchetto.');
      key='adl-modern:v1:'+D.sourceCommit+':'+encodeURIComponent(run)+':'+encodeURIComponent(learnerId)+':'+testcase.name;
      state=C.unpack(localStorage.getItem(key))||{cursor:0,rows:[],config:{run,learnerId},created:new Date().toISOString()};
      if(!Array.isArray(state.rows)||!Number.isInteger(state.cursor))throw Error('Log locale non valido. Usa una nuova sessione e azzera il tentativo LMS.');
      if(state.owner)throw Error('Sessione già aperta o interrotta. Esporta il log; per ripartire usa una nuova sessione e un tentativo LMS pulito.');
      if(state.cursor>=testcase.steps.length){render();return;}
      state.owner=token;save();active=true;el('start').disabled=true;
      localStorage.setItem('adl-modern:last-config',JSON.stringify({run,learnerId}));
      performTest();save();
    }catch(e){if(state){add({status:'BLOCKED',note:String(e)});try{save();}catch(_){}}el('summary').textContent='BLOCKED: '+e;}
  };
  try{const last=JSON.parse(localStorage.getItem('adl-modern:last-config')||'null');if(last){el('run').value=last.run;el('learner').value=last.learnerId;}}catch(_){}
  // pagehide replaces unload, which is no longer reliably dispatched by modern browsers.
  window.addEventListener('pagehide',()=>{
    if(!active||exited)return;exited=true;
    try{if(typeof completeTest==='function')completeTest();finish(true);if(state){state.owner=null;save();}}
    catch(e){add({status:'BLOCKED',note:'Departure error: '+e});try{save();}catch(_){}}
  });
  window.addEventListener('error',event=>{if(active){add({status:'BLOCKED',note:'Page error: '+event.message});try{save();}catch(_){}}});
}
