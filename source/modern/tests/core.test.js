const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const C=require('../core.js');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/LMSTestPackage_API/common/data.js'),'utf8'),context);const vocab=context.window.ADL_DATA.vocabulary.Commands;
test('decode preserves literal punctuation, unicode and empty SET values',()=>{
 assert.deepEqual(C.decode('SET->c~LOC!a!b->t->0',vocab).args,['cmi.location','a!b']);
 assert.deepEqual(C.decode('SET->c~LOC!->t->0',vocab).args,['cmi.location','']);
 assert.deepEqual(C.decode('SET->!test->f->351',vocab).args,['','test']);
 assert.equal(C.decode('GET->c~INTR~0~LR!TY.f->x->0',vocab).type,'fill-in');
});
test('target navigation and request_valid decode',()=>{
 assert.deepEqual(C.decode('SET->a~n~r!tar~activity_1~TY.c->t->0',vocab).args,['adl.nav.request','{target=activity_1}choice']);
 assert.deepEqual(C.decode('GET->a~n~rv~TY.c~tar~activity_1->t->0',vocab).args,['adl.nav.request_valid.choice.{target=activity_1}']);
});
test('all original scenario commands decode without unsupported opcodes',()=>{
 let count=0;for(const dir of fs.readdirSync(path.join(__dirname,'../dist'))){if(!dir.startsWith('LMSTestPackage_')||dir.endsWith('.zip'))continue;
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist',dir,'common/data.js'),'utf8'),ctx);
 for(const step of ctx.window.ADL_DATA.case.steps)for(const command of step.commands){const d=C.decode(command.raw,vocab);assert.ok(d.method);count++;}}
 assert.ok(count>11000);
});
test('error mismatch is failure even if return value matches',()=>{
 const api={Initialize:()=> 'true',GetLastError:()=> '101'};
 assert.equal(C.execute(api,C.decode('I->->t->0',vocab)).status,'FAIL');
});
test('booleans, exceptions and missing API methods cannot pass',()=>{
 assert.equal(C.execute({Initialize:()=>true,GetLastError:()=> '0'},C.decode('I->->t->0',vocab)).status,'FAIL');
 assert.equal(C.execute({},C.decode('I->->t->0',vocab)).status,'FAIL');
 assert.equal(C.execute({Initialize:()=>{throw Error('boom');}},C.decode('I->->t->0',vocab)).status,'FAIL');
});
test('typed numeric/duration/children comparisons and REVIEW fallback',()=>{
 const check=(raw,val)=>C.equalValue(C.decode(raw,vocab),val).status;
 assert.equal(check('GET->c~TT->PT1M->0','PT0H1M0S'),'PASS');
 assert.equal(check('GET->c~TT->PT1M->0','PT2M'),'FAIL');
 assert.equal(check('GET->c~S~SCA->0.5->0','0.500'),'PASS');
 assert.equal(check('GET->c~INTR~0~LR!TY.m->a[.]b[,]c[.]d->0','c[.]d[,]a[.]b'),'REVIEW');
 assert.equal(check('GET->c~INTR~CHIL->id,type->0','type,id'),'PASS');
});
test('learner expected ID and original diagnostic rules',()=>{
 const cmd=C.decode('GET->c~LI->m->0',vocab);
 assert.equal(C.equalValue(cmd,'abc',{}).status,'REVIEW');
 assert.equal(C.equalValue(cmd,'abc',{learnerId:'other'}).status,'FAIL');
 assert.equal(C.equalValue(C.decode('GeDi->001->emptyCS->0',vocab),'diagnostic').status,'PASS');
});
test('dynamic objective lookup and COI unordered collection',()=>{
 const data={'cmi.objectives._count':'2','cmi.objectives.0.id':'second','cmi.objectives.1.id':'first','cmi.objectives.1.success_status':'passed'};
 const api={GetValue:p=>data[p],GetLastError:()=> '0'};
 assert.equal(C.execute(api,C.decode('GET->c~OB~&first&~SS->pass->0',vocab)).status,'PASS');
 assert.equal(C.execute(api,C.decode('COI->first,second',vocab)).status,'PASS');
 assert.equal(C.execute(api,C.decode('GET->c~OB~&missing&~SS->pass->0',vocab)).status,'FAIL');
});
test('API discovery handles cross-origin errors and opener',()=>{
 const api={};const blocked={get API_1484_11(){throw Error('SecurityError')},get parent(){throw Error('SecurityError')},opener:{API_1484_11:api}};
 assert.equal(C.findAPI(blocked),api);assert.equal(C.findAPI({}),null);
});
test('incomplete or review never becomes aggregate PASS',()=>{
 assert.equal(C.summary({cursor:0,rows:[]},1).status,'INCOMPLETE');
 assert.equal(C.summary({cursor:1,rows:[{status:'REVIEW'}]},1).status,'REVIEW');
 assert.equal(C.summary({cursor:1,rows:[{status:'FAIL'}]},1).status,'FAIL');
});
test('compressed logs preserve large unicode values across serialization',()=>{
 const value={cursor:3,rows:[{actual:'日本語😀'.repeat(50000),expected:'a'.repeat(64000)}]};
 const packed=C.pack(value);assert.ok(packed.length<10000);assert.deepEqual(C.unpack(packed),value);
 assert.throws(()=>C.unpack('Z1:broken'));
});
