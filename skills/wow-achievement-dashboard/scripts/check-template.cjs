'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const skill=path.resolve(__dirname,'..'),assets=path.join(skill,'assets/obsidian');
const m=require(path.join(assets,'_System/Data/achievement-model.cjs'));
const fixture=fs.readFileSync(path.join(skill,'tests/fixtures/account.json'),'utf8');
{
 const data=JSON.parse(fixture.replaceAll('{{ROOT}}','WoW'));
 for(const [field,type,idField] of [['tasks','achievement','id'],['shopping','item','item_id']]){
  const row=data[field][0],id=row[idField],base='https://www.wowhead.com/';
  for(const prefix of ['', 'de/', 'fr/', 'ko/']){
   for(const suffix of ['', '/märchen', '?foo=bar', '#comments', '/名字?foo=bar#comments']){
    row.wowhead_url=base+prefix+type+'='+id+suffix;
    assert.doesNotThrow(()=>m.validate(data),row.wowhead_url);
   }
  }
  for(const url of [base+'de/'+type+'='+id+'0',base+'de/'+type+'='+(id+1),base+'de/'+(type==='item'?'achievement':'item')+'='+id,base+'DE/'+type+'='+id,base+'de/../'+type+'='+id,base+type+'='+id+'/../../item=999',base+type+'='+id+'\n',base+type+'='+id+'/\\evil',base.replace('https:','http:')+type+'='+id,'https://www.wowhead.com.evil.test/'+type+'='+id,'https://www.wowhead.com@evil.test/'+type+'='+id,'javascript:alert(1)']){
   row.wowhead_url=url;assert.throws(()=>m.validate(data),url);
  }
  row.wowhead_url=base+type+'='+id;
 }
}
{
 const rows=[{id:1,game_state:'incomplete',source:'research',queue:'execute'},{id:2,game_state:'incomplete',source:'execute',record_kind:'meta'},{id:3,game_state:'incomplete',source:'execute',queue:'research'}];
 const tasks=rows.map(r=>({blockId:'ach-'+r.id,status:' '}));
 const groups=m.partition({tasks:rows,research_source:'research'},tasks);
 assert.deepEqual(groups.execution.map(x=>x.row.id),[1]);
 assert.deepEqual(groups.research.map(x=>x.row.id),[2,3]);
 assert.equal(m.isActive(rows[1],new Map()),false);
 const scheduled={...rows[0],availability:[{expansion_order:9,expansion:'Demo',continent:'Demo',area:'Demo',what:'Rotating activity',tomtom:['/way #1 50 50 Demo'],checks:['/run OpenWorldMap(1)'],check_note:'Manual map inspection'}]};
 assert.equal(m.partition({tasks:[scheduled],research_source:'research'},tasks).availability.length,1);
 assert.equal(m.select([scheduled],new Map()).length,0);
 assert.equal(m.select([scheduled],new Map(),{includeScheduled:true}).length,1);
 assert.equal(m.partition({tasks:[scheduled],research_source:'research'},[{blockId:'ach-1',status:'x'}]).manual.length,1);
 assert.deepEqual(m.shopping({tasks:rows,shopping:[{unit_cost:1,owned_usable:0,allocations:[{achievement_id:2,quantity:1}]}]},new Map()),[]);
}
function copyTree(from,to,replacements){
 fs.mkdirSync(to,{recursive:true});
 for(const name of fs.readdirSync(from)){
  const src=path.join(from,name),dst=path.join(to,name);
  if(fs.statSync(src).isDirectory())copyTree(src,dst,replacements);
  else{
   let text=fs.readFileSync(src,'utf8');
   for(const [key,value]of Object.entries(replacements))text=text.replaceAll('{{'+key+'}}',value);
   assert(!/\{\{[A-Z_]+\}\}/.test(text),'unresolved template token in '+name);
   fs.writeFileSync(dst,text);
  }
 }
}
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.events={};this.style={};this.value='';this.checked=false;this.textContent='';}
 appendChild(child){this.children.push(child);return child;}
 replaceChildren(){this.children=[];}
 setAttribute(key,value){this[key]=value;}
 addEventListener(key,fn){this.events[key]=fn;}
}
const all=(node,tag)=>[...(node.tag===tag?[node]:[]),...node.children.flatMap(c=>all(c,tag))];
const textOf=node=>node.textContent+' '+node.children.map(textOf).join(' ');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function rows(vault,source){
 return fs.readFileSync(path.join(vault,source),'utf8').split('\n').flatMap((text,line)=>{
  const id=m.taskId({text});
  return text.startsWith('- [')&&text[4]===']'&&id?[{text,status:text[3],blockId:'ach-'+id,path:source,line}]:[];
 });
}
function fakeApi(vault){
 const roots=[],rendered=[];
 const dv={
  el(tag,text){const e=new Element(tag);e.textContent=text;roots.push(e);return e;},
  header(){},paragraph(){},taskList(tasks){rendered.push(...tasks);},
  page(source){return fs.existsSync(path.join(vault,source))?{file:{tasks:rows(vault,source)}}:null;},
  io:{load:async source=>fs.existsSync(path.join(vault,source))?fs.readFileSync(path.join(vault,source),'utf8'):undefined},
 };
 dv.view=async(source,input)=>new AsyncFunction('dv','input','document',fs.readFileSync(path.join(vault,source+'.js'),'utf8'))(dv,input,{createElement:t=>new Element(t)});
 return {dv,roots,rendered};
}
async function render(vault,folder,note){
 const context=fakeApi(vault),source=fs.readFileSync(path.join(vault,folder,note),'utf8');
 const code=source.match(/\x60\x60\x60dataviewjs\n([\s\S]*?)\n\x60\x60\x60/)[1];
 await new AsyncFunction('dv',code)(context.dv);
 return context;
}
async function exercise(folder,localized=false){
 const vault=fs.mkdtempSync(path.join(os.tmpdir(),'wow-template-'));
 try{
  const data=JSON.parse(fixture.replaceAll('{{ROOT}}',folder));
  if(localized){
   const identities=new Map(data.characters.map((name,i)=>[name,['Mära-Die Aldor','星光-银月'][i]]));
   data.characters=data.characters.map(name=>identities.get(name));
   for(const row of data.tasks){row.name='Erfolg 星光 '+row.id;row.characters=row.characters.map(name=>identities.get(name));row.wowhead_url='https://www.wowhead.com/de/achievement='+row.id;}
   for(const item of data.shopping){item.name='Étoffe 魔法';item.currency_label='金幣';item.character=identities.get(item.character)||item.character;item.wowhead_url='https://www.wowhead.com/fr/item='+item.item_id;}
  }
  const taskText=source=>data.tasks.filter(t=>t.source===source).map(t=>
   '- ['+(t.game_state==='completed'||data.example_manual_ids.includes(t.id)?'x':' ')+'] ['+t.name+']('+t.wowhead_url+') ^ach-'+t.id).join('\n');
  const replacements={ROOT:folder,EXECUTION_TASKS:taskText(data.task_sources[0]),RESEARCH_TASKS:taskText(data.task_sources[1]),IMPORTED_TASKS:taskText(data.task_sources[2]),COVERAGE_REPORT:'Demo only; no real account was imported.',PLUGIN_READINESS:'Runtime not checked in this temporary vault.',REFRESH_REPORT:'Synthetic first import.',VALIDATION_REPORT:'Automated fixture checks only.',SESSION_PLAN:'Demo session; no gameplay advice.',SESSION_ACTIONS:'- [ ] Demonstration action; excluded from achievement sources. ^action-demo',SESSION_FEEDBACK:'No observed play time.',TOUR_OVERVIEW:'Demo pair only.',TOUR_STOPS:'No real itinerary.',TOMTOM_ROUTE:'No verified waypoints in this demo.',TOUR_EVIDENCE:'Synthetic layout check; not gameplay advice.'};
  replacements.CURRENT_PLANS='[['+folder+'/Plans/Session|Example session]] — synthetic action checklist; data date: unknown.';
  replacements.SNAPSHOT_DATE='Unknown (synthetic fixture)';
  copyTree(assets,path.join(vault,folder),replacements);
  // Every bundled navigation target must exist after root substitution.
  function checkLinks(dir){
   for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())checkLinks(file);
    else if(file.endsWith('.md')){
     const note=fs.readFileSync(file,'utf8');
     for(const match of note.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)){
      const target=match[1].endsWith('.md')?match[1]:match[1]+'.md';
      assert(fs.existsSync(path.join(vault,target)),file+' links to missing '+target);
     }
     if(note.includes('```dataviewjs'))assert(!data.task_sources.includes(path.relative(vault,file)),'view is not a canonical source');
    }
   }
  }
  checkLinks(path.join(vault,folder));
  const dataPath=path.join(vault,folder,'_System/Data/achievement-data.json');
  fs.writeFileSync(dataPath,JSON.stringify(data));
  m.validate(data);
  const tasks=data.task_sources.flatMap(s=>rows(vault,s)),states=m.manualStates(tasks);
  assert.equal(tasks.length,6);assert.equal(new Set(tasks.map(m.taskId)).size,6);
  const grouped=m.partition(data,tasks);
  assert.equal(grouped.execution.length,2);assert.equal(grouped.research.length,1);
  assert.equal(grouped.confirmed.length,1);assert.equal(grouped.manual.length,1);assert.equal(grouped.unknown.length,1);
  assert.deepEqual(m.select(data.tasks,states,{budget:15}).map(x=>x.id),[7]);
  assert.equal(m.select(data.tasks,states,{budget:14}).length,0);
  assert.equal(m.select(data.tasks,states,{categories:['quick-wins','buyable'],budget:30,character:data.characters[0]}).length,1);
  assert.equal(m.taskId({blockId:'action-demo',text:'See https://www.wowhead.com/achievement=7'}),null);
  assert.equal(m.shopping(data,states)[0].buy,null);assert.equal(m.shopping(data,states)[0].max_cost,7.5);
  const unknownPrice=structuredClone(data);unknownPrice.shopping[0].unit_cost=null;
  assert.equal(m.shopping(unknownPrice,states)[0].max_cost,null);
  const owned=structuredClone(data);owned.shopping[0].owned_usable=2;
  assert.equal(m.shopping(owned,states)[0].buy,1);assert.equal(m.shopping(owned,states)[0].max_cost,2.5);
  const checked=tasks.map(t=>m.taskId(t)===8?{...t,status:'x'}:t);
  assert.equal(m.partition(data,checked).execution.length,1);assert.equal(m.partition(data,checked).manual.length,2);
  assert.equal(m.shopping(data,m.manualStates(checked)).length,0);assert.equal(m.summarize(data,m.manualStates(checked)).confirmedAP,1000);
  assert.equal(m.partition(data,tasks).execution.length,2);assert.equal(m.partition(data,[...tasks,tasks[0]]).confirmed.length,1);
  assert.equal(m.partition(data,[]).missing.length,6);
  assert.equal(m.partition(data,tasks.map(t=>m.taskId(t)===7?{...t,status:'-'}:t)).excluded.length,1);
  for(const mutate of [d=>d.tasks.push({...d.tasks[0]}),d=>d.tasks[0].source='../outside.md',d=>d.tasks[0].wowhead_url='javascript:alert(1)',d=>d.tasks[1].planning_max=-1,d=>d.shopping[0].allocations[0].achievement_id=999,d=>d.validation={reconciled:true,completed_records:1,calculated_completed_ap:10}]){
   const bad=structuredClone(data);mutate(bad);assert.throws(()=>m.validate(bad));
  }
  for(const [note,taskCount] of [['Lists/To Do.md',2],['Lists/Future Goals.md',1],['Lists/Completed.md',1]]){
   const c=await render(vault,folder,note);assert.equal(c.rendered.length,taskCount);
   assert(c.rendered.every(t=>data.task_sources.includes(t.path)));assert(textOf(c.roots[0]).includes('DEMO DATA'));
  }
  const dashboard=await render(vault,folder,'Dashboard.md'),root=dashboard.roots[0];
  // Simulate the browser's first-option selection.
  const selects=all(root,'select');for(const s of selects)s.value=s.children[0].value;
  selects[0].events.change();assert.equal(all(root,'tr').length,3);
  if(localized){
   assert(textOf(root).includes('Erfolg 星光 7'));assert(textOf(root).includes('Mära-Die Aldor'));
   const character=selects.find(s=>s.children.some(o=>o.value===data.characters[0]));
   character.value=data.characters[1];character.events.change();assert.equal(all(root,'tr').length,0);
   character.value=data.characters[0];character.events.change();assert.equal(all(root,'tr').length,3);
  }
  selects[0].value='15';selects[0].events.change();assert.equal(all(root,'tr').length,2);
  const shopping=await render(vault,folder,'Lists/Shopping.md');
  assert(textOf(shopping.roots[0]).includes('7.5 '+data.shopping[0].currency_label));assert(!textOf(shopping.roots[0]).includes('Derby Marks'));
  if(localized)assert(textOf(shopping.roots[0]).includes('Étoffe 魔法'));
  const unavailable=structuredClone(data);unavailable.account_ap=null;fs.writeFileSync(dataPath,JSON.stringify(unavailable));
  assert(textOf((await render(vault,folder,'Dashboard.md')).roots[0]).includes('Unavailable'));
  const gated=structuredClone(data),active=gated.tasks.find(r=>r.id===8);
  const waypoint=localized?'/way #1 50 50 Entrée 星光':'/way #1 50 50 Demo';
  active.availability=[{expansion_order:1,expansion:'Demo',continent:'Demo',area:'Test area',what:'Required rotation',tomtom:[waypoint],checks:['/run OpenWorldMap(1)'],check_note:'Map inspection, not automatic detection'}];
  fs.writeFileSync(dataPath,JSON.stringify(gated));m.validate(gated);
  const avail=await render(vault,folder,'Lists/Waiting & Events.md');
  assert.equal(all(avail.roots[0],'tr').length,2);assert.equal(all(avail.roots[0],'button').length,2);
  assert(textOf(avail.roots[0]).includes('Required rotation'));
  const nav=Object.getOwnPropertyDescriptor(global,'navigator');
  Object.defineProperty(global,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{assert.equal(value,waypoint);}}}});
  try{await all(avail.roots[0],'button')[0].events.click();}finally{if(nav)Object.defineProperty(global,'navigator',nav);else delete global.navigator;}
  assert.equal(all(avail.roots[0],'button')[0].textContent,'Copied');
  const empty={...data,is_demo:false,account_ap:null,tasks:[],shopping:[],characters:[]};fs.writeFileSync(dataPath,JSON.stringify(empty));
  assert(textOf((await render(vault,folder,'Dashboard.md')).roots[0]).includes('No verified match'));
  assert(textOf((await render(vault,folder,'Lists/Shopping.md')).roots[0]).includes('No remaining purchases'));
  fs.writeFileSync(dataPath,JSON.stringify(data));fs.writeFileSync(path.join(vault,data.task_sources[0]),'# No source tasks yet\n');
  await assert.rejects(()=>render(vault,folder,'Dashboard.md'),/Canonical source tasks missing/);
  console.log('PASS: portable vault "'+folder+'"; live views, check/uncheck, budgets, purchases, unknowns, validation and empty states.');
 }finally{fs.rmSync(vault,{recursive:true,force:true});}
}
(async()=>{
 for(const folder of ['WoW','Collection Lab','Games/Alternative'])await exercise(folder);
 await exercise('Spiele/Erfolge 星光',true);
 console.log('No personal vault or account was used. DOM checks do not replace an Obsidian runtime/visual check.');
})().catch(e=>{console.error(e);process.exitCode=1;});
