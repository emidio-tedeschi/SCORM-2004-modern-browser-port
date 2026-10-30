/* Independent browser port, 2026. ADL scenario interpretation: see NOTICE.txt. */
(function (root) {
'use strict';
const methods={I:'Initialize',T:'Terminate',C:'Commit',GET:'GetValue',SET:'SetValue',GLE:'GetLastError',GES:'GetErrorString',GeDi:'GetDiagnostic',COI:'compareObjIds'};
function decode(raw, vocabulary) {
  const parts=raw.split('->'); const [op,param='',expected='',error='']=parts;
  if (!methods[op]) throw Error('Unsupported command: '+op);
  const word=s=>Object.prototype.hasOwnProperty.call(vocabulary,s)?vocabulary[s]:s;
  let args=[],type='';
  function path(s) {
    const chunks=s.split('~').map(x=>{const i=x.indexOf('!'); if(i>=0){type=word(x.slice(i+1));return x.slice(0,i);}return x;});
    if(chunks[0]==='a' && chunks[2]==='rv' && chunks.length===6)
      return chunks.slice(0,4).map(word).join('.')+'.'+word(chunks[4]).replace('%s',chunks[5]);
    return chunks.map(word).join('.');
  }
  if(op==='SET') {
    const bang=param.indexOf('!');
    if(bang<0)throw Error('Missing SET delimiter');
    let val=param.slice(bang+1);
    if(val.startsWith('tar~')) {const t=val.split('~');val='{target='+t[1]+'}'+word(t[2]);}
    else val=word(val);
    args=[path(param.slice(0,bang)),val];
  } else if(op==='GET') args=[path(param)];
  else if(op==='GLE')args=[];
  else if(op==='COI')args=[param];
  else args=[param];
  return {op,method:methods[op],args,type,expected:(op==='GES'||op==='GeDi')?expected:word(expected),error,raw};
}
function duration(s) {
  const m=/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s);
  if(!m || !m.slice(1).some(x=>x!==undefined))return null;
  // Keep year/month components separate: no unsupported calendar conversion.
  return [Number(m[1]||0),Number(m[2]||0),Number(m[3]||0)*86400+Number(m[4]||0)*3600+Number(m[5]||0)*60+Number(m[6]||0)];
}
function equalValue(cmd,actual,config={}) {
  const p=cmd.args[0]||'', expected=cmd.expected;
  if(typeof actual!=='string')return {status:'FAIL',note:'SCORM API must return a string'};
  if(cmd.op==='GeDi')return {status:actual.length<255?'PASS':'FAIL',note:'ADL diagnostic length rule'};
  if(cmd.op==='GES')return {status:(expected==='less255'?actual.length<255:expected==='emptyCS'?actual==='':actual===expected)?'PASS':'FAIL'};
  if(cmd.op!=='GET')return {status:actual===expected?'PASS':'FAIL'};
  if(p==='cmi.learner_name')return {status:'PASS',note:'Original ADL checks error only for learner_name'};
  if(p==='cmi.learner_id')return config.learnerId?{status:actual===config.learnerId?'PASS':'FAIL'}:{status:'REVIEW',note:'Enter expected learner ID before running'};
  if(p.includes('request_valid'))return {status:['true','false','unknown'].includes(actual)?'PASS':'FAIL',note:'Original ADL vocabulary check, not exact expected boolean'};
  if(p.includes('&') && p.endsWith('.id') && expected===''){const id=/&([^&]+)&/.exec(p)?.[1];return {status:actual===id?'PASS':'FAIL'};}
  if(actual===expected)return {status:'PASS'};
  if(p.endsWith('._children')) {
    const sorted=x=>x.split(',').map(s=>s.trim()).sort().join(',');
    return {status:sorted(actual)===sorted(expected)?'PASS':'FAIL'};
  }
  if(/\.(?:score\.(?:scaled|raw|min|max)|progress_measure|completion_threshold|scaled_passing_score|audio_level|delivery_speed|weighting)$/.test(p)) {
    const valid=x=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(x);
    return {status:valid(actual)&&valid(expected)&&Number(actual)===Number(expected)?'PASS':'FAIL'};
  }
  if(/\.(?:total_time|session_time|latency|max_time_allowed)$/.test(p)) {
    const a=duration(actual),b=duration(expected);
    return {status:a&&b&&a[0]===b[0]&&a[1]===b[1]&&Math.abs(a[2]-b[2])<1e-7?'PASS':'FAIL'};
  }
  // Java uses type-specific equals, including localized strings, timestamps and interaction patterns.
  // Never turn an unported semantic comparison into a PASS or a false conformance failure.
  if(cmd.type || /\.(?:timestamp|learner_response|pattern|description|comment|id)$/.test(p) || actual.startsWith('{') || expected.startsWith('{'))
    return {status:'REVIEW',note:'Non-identical typed values: Java semantic comparator not fully ported'};
  return {status:'FAIL'};
}
function execute(api,cmd,config={}) {
  const row={method:cmd.method,args:[...cmd.args],expected:cmd.expected,expectedError:cmd.error,source:cmd.raw};
  const call=(method,args)=>{
    if(typeof api?.[method]!=='function')throw Error('API method missing: '+method);
    return api[method](...args);
  };
  try {
    if(cmd.op==='COI') {
      const countRaw=call('GetValue',['cmi.objectives._count']);
      if(typeof countRaw!=='string'||!/^\d+$/.test(countRaw)||Number(countRaw)>10000)throw Error('Invalid objective count');
      const values=[];for(let i=0;i<Number(countRaw);i++)values.push(call('GetValue',[`cmi.objectives.${i}.id`]));
      row.actual=values;row.expected=cmd.args[0].split(',');
      row.status=JSON.stringify([...values].sort())===JSON.stringify([...row.expected].sort())?'PASS':'FAIL';return row;
    }
    if(row.args[0]?.includes('&')) {
      row.args[0]=row.args[0].replace(/&([^&]+)&/,(_,id)=>{
        const collection=row.args[0].startsWith('adl.data.')?'adl.data':'cmi.objectives';
        const raw=call('GetValue',[collection+'._count']);
        if(typeof raw!=='string'||!/^\d+$/.test(raw)||Number(raw)>10000)throw Error('Invalid collection count');
        for(let i=0;i<Number(raw);i++)if(call('GetValue',[`${collection}.${i}.id`])===id)return String(i);
        throw Error('Objective/data ID not found: '+id);
      });
    }
    row.actual=call(cmd.method,row.args);
    row.actualType=typeof row.actual;
    row.error=call('GetLastError',[]);
    if(cmd.op==='GET' && row.args[0].includes('comments_from_lms')&&!row.args[0].includes('_children')) {
      const allowed=['0','301','403'];if(row.args[0]==='cmi.comments_from_lms')allowed.push('401');
      row.status=typeof row.actual==='string'&&allowed.includes(row.error)?'PASS':'FAIL';
      row.note='Original ADL comments_from_lms optional-data rule';return row;
    }
    Object.assign(row,equalValue(cmd,row.actual,config));
    if(cmd.op==='T') {row.status='REVIEW';row.note='Original command has no explicit expected result; lifecycle requires review';}
    else if(typeof row.error!=='string'||row.error!==cmd.error) {row.status='FAIL';row.note=(row.note||'')+' GetLastError mismatch';}
  } catch(e) {row.status='FAIL';row.exception=String(e);}
  return row;
}
function findAPI(start) {
  const seen=new Set(); const queue=[start];let n=0;
  while(queue.length&&n++<500){let w=queue.shift();if(!w||seen.has(w))continue;seen.add(w);
    try{if(w.API_1484_11)return w.API_1484_11;}catch(_){}
    try{if(w.parent!==w)queue.push(w.parent);}catch(_){}
    try{if(w.opener)queue.push(w.opener);}catch(_){}
  }return null;
}
function summary(state,total) {
  const counts={PASS:0,FAIL:0,REVIEW:0,BLOCKED:0,INFO:0};
  for(const r of state.rows)counts[r.status]=(counts[r.status]||0)+1;
  const status=counts.BLOCKED?'BLOCKED':counts.FAIL?'FAIL':state.cursor<total?'INCOMPLETE':counts.REVIEW?'REVIEW':'PASS';
  return {status,counts,completedVisits:state.cursor,totalVisits:total,officialConformance:false};
}
const compression=typeof module!=='undefined'?require('./pako.min.js'):root.pako;
function pack(state){
 const bytes=compression.deflate(JSON.stringify(state));let binary='';
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return 'Z1:'+btoa(binary);
}
function unpack(text){if(!text)return null;if(!text.startsWith('Z1:'))return JSON.parse(text);
 const binary=atob(text.slice(3));const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 return JSON.parse(compression.inflate(bytes,{to:'string'}));
}
const exported={decode,duration,equalValue,execute,findAPI,summary,pack,unpack};
if(typeof module!=='undefined')module.exports=exported;
root.ADLModern=exported;
})(typeof globalThis!=='undefined'?globalThis:this);
