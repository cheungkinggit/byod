/** BYOD iPad 抽查系統 — Google Apps Script / HTML Service. */
const HEADERS_ = {
  Actions: ['id','title','date','time','grade','coordinatorName','status','classesJson','createdAt','updatedAt'],
  Assignments: ['actionId','classId','label','teacherName','sampleCount','rosterJson','selectedJson','replacementJson','updatedAt'],
  Records: ['actionId','classId','studentId','result','issuesJson','remarks','followUp','followDate','followNotes','checkedBy','checkedAt'],
  Students: ['class','number','name'],
  Teachers: ['name','defaultClass']
};
const ISSUES_ = ['使用時間過長','不恰當資料（相片／影片）','觀看視頻過多（如 YouTube）','其他問題'];
function doGet(e) {
  if(e && e.parameter && e.parameter.bridge==='1') {
    const nonce=String(e.parameter.nonce||'');
    if(!/^[0-9a-f]{32}$/.test(nonce))return HtmlService.createHtmlOutput('Invalid request');
    const page=HtmlService.createTemplateFromFile('Bridge');
    page.nonce=nonce;
    return page.evaluate().setTitle('BYOD connection v4')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('BYOD iPad 抽查系統').addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
}
function passwordHash_(password,salt) {
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+String(password),Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}
function login(loginName,password) {
  const p=PropertiesService.getScriptProperties(),salt=p.getProperty('PASSWORD_SALT'),adminHash=p.getProperty('ADMIN_PASSWORD_HASH'),teacherHash=p.getProperty('TEACHER_PASSWORD_HASH');
  if(!salt||!adminHash||!teacherHash)throw new Error('系統密碼尚未設定，請聯絡管理員。');
  const username=String(loginName||'').trim(),value=String(password||'');
  if(!username||value.length<8||value.length>128)throw new Error('登入名稱或密碼不正確。');
  const hash=passwordHash_(value,salt),account=username.toLowerCase();
  const session=account==='admin'&&hash===adminHash?{role:'admin',name:''}:account==='byod'&&hash===teacherHash?{role:'teacher',name:''}:null;
  if(!session)throw new Error('登入名稱或密碼不正確。');
  const token=Utilities.getUuid();CacheService.getScriptCache().put('session:'+token,JSON.stringify(session),21600);
  return {token,role:session.role,name:session.name,app:getAppState(token)};
}
function session_(token) {
  const value=String(token||'');if(!/^[0-9a-f-]{36}$/.test(value))throw new Error('請先輸入密碼登入。');
  const session=json_(CacheService.getScriptCache().get('session:'+value),null);
  if(!session||!['admin','teacher'].includes(session.role))throw new Error('登入已過期，請重新輸入密碼。');
  return session;
}
function role_(token) {return session_(token).role;}
function logout(token) {role_(token);CacheService.getScriptCache().remove('session:'+token);return true;}
function admin_(token) {if(role_(token)!=='admin')throw new Error('只有管理員可以執行此操作。');}
function selectTeacher(token,name) {
  const session=session_(token),teacher=String(name||'').trim();
  if(session.role!=='teacher'||!teacherNames_().includes(teacher))throw new Error('請選擇教師名單上的負責老師。');
  session.name=teacher;CacheService.getScriptCache().put('session:'+token,JSON.stringify(session),21600);
  return getAppState(token);
}
function teacher_(name,token) {
  const session=session_(token);
  if(session.role==='admin')return '';
  if(!session.name)throw new Error('請先選擇負責老師。');
  if(!teacherNames_().includes(session.name))throw new Error('教師帳戶已停用，請聯絡管理員。');
  return session.name;
}
function lead_(action,role,name) { return role==='admin' || !!name&&action.coordinatorName===name; }
function access_(action,role,name) { return lead_(action,role,name) || !!name&&action.classes.some(x=>x.teacherName===name); }
let spreadsheet_;
function store_() {
  if(spreadsheet_)return spreadsheet_;
  const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('尚未設定 SPREADSHEET_ID。');
  return spreadsheet_=SpreadsheetApp.openById(id);
}
function rows_(sheet,displayKeys=[]) {
  const range=sheet.getDataRange(),values=range.getValues(),keys=values.shift() || [];
  const display=displayKeys.length?range.getDisplayValues().slice(1):null;
  return values.map((row,i)=>({row:i+2,data:Object.fromEntries(keys.map((k,j)=>[k,displayKeys.includes(k)?display[i][j]:row[j]]))})).filter(x=>x.data[keys[0]]);
}
function sheet_(name) { const sh=store_().getSheetByName(name); if (!sh) throw new Error('缺少 '+name+' 工作表，請先執行 initializeStorage。'); return sh; }
function json_(v,fallback) { try { return JSON.parse(String(v)); } catch(e) { return fallback; } }
function dateText_(v) { return v instanceof Date ? Utilities.formatDate(v,'Asia/Hong_Kong','yyyy-MM-dd') : String(v || ''); }
function now_() { return Utilities.formatDate(new Date(),'Asia/Hong_Kong','yyyy-MM-dd HH:mm:ss'); }
function bounded_(v,n) { const s=String(v || '').trim(); if (!s || s.length>n) throw new Error('資料不可留空，長度上限 '+n+' 字。'); return s; }
function cached_(key,fn,seconds=30,group='data') {
  const cache=CacheService.getScriptCache(),version=cache.get('revision:'+group)||'0',id=version+':'+key;
  const hit=cache.get(id);if(hit){try{return JSON.parse(hit)}catch(e){}}
  const value=fn();try{cache.put(id,JSON.stringify(value),seconds)}catch(e){}return value;
}
function teacherNames_(){return cached_('teacherNames',()=>rows_(sheet_('Teachers')).map(x=>String(x.data.name).trim()),120,'directory')}
function locked_(fn,directory=false) {
  const l=LockService.getScriptLock();l.waitLock(15000);
  try{const result=fn();SpreadsheetApp.flush();const cache=CacheService.getScriptCache();cache.put('revision:data',Utilities.getUuid(),21600);if(directory)cache.put('revision:directory',Utilities.getUuid(),21600);return result}
  finally{l.releaseLock()}
}
function initializeStorage(token) {
  admin_(token); const ss=store_();
  Object.keys(HEADERS_).forEach(name=>{let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);if(sh.getLastRow()===0)sh.appendRow(HEADERS_[name]);});
  CacheService.getScriptCache().put('revision:directory',Utilities.getUuid(),21600);
  return '已建立系統工作表。';
}
function getDirectory(token) {
  admin_(token);
  return cached_('directory',()=>({
    students:rows_(sheet_('Students')).map(({data:d})=>({classLabel:String(d.class||'').trim(),number:String(d.number||'').trim(),name:String(d.name||'').trim()})),
    teachers:rows_(sheet_('Teachers')).map(({data:d})=>({name:String(d.name||'').trim(),defaultClass:String(d.defaultClass||'').trim()}))
  }),600,'directory');
}
function saveClassRoster(token,classLabel,students) {
  admin_(token);return locked_(()=>{
    const label=String(classLabel||'').trim();
    if(!/^[456][A-E]$/.test(label))throw new Error('請選擇小四至小六班別。');
    if(!Array.isArray(students)||students.length<1||students.length>60)throw new Error('每班名單須有 1 至 60 人。');
    const clean=students.map(x=>({number:bounded_(x?.number,10),name:bounded_(x?.name,80)}));
    if(clean.some(x=>!/^[0-9]{1,3}$/.test(x.number)))throw new Error('學號須為 1 至 3 位數字。');
    if(new Set(clean.map(x=>x.number)).size!==clean.length)throw new Error('同班學號不能重複。');
    const sh=sheet_('Students'),others=rows_(sh).map(({data:d})=>[String(d.class||'').trim(),String(d.number||'').trim(),String(d.name||'').trim()]).filter(x=>x[0]!==label);
    const all=[...others,...clean.map(x=>[label,x.number,x.name])].sort((a,b)=>a[0].localeCompare(b[0])||Number(a[1])-Number(b[1]));
    if(all.length+1>sh.getMaxRows())sh.insertRowsAfter(sh.getMaxRows(),all.length+1-sh.getMaxRows());
    const height=Math.max(sh.getLastRow()-1,all.length);
    sh.getRange(2,1,height,3).setValues([...all,...Array.from({length:height-all.length},()=>['','',''])]);
    return {classLabel:label,count:clean.length};
  },true);
}
function saveTeacher(token,entry,oldName) {
  admin_(token);return locked_(()=>{
    const name=bounded_(entry?.name,80),defaultClass=String(entry?.defaultClass||'').trim(),old=String(oldName||'').trim();
    if(defaultClass&&!/^[1-6][A-E]$/.test(defaultClass))throw new Error('預設班別格式須如 4A。');
    const sh=sheet_('Teachers'),list=rows_(sh),match=list.find(x=>String(x.data.name).trim()===old);
    if(old&&!match)throw new Error('原有教師已被修改，請重新載入名單。');
    if(list.some(x=>x!==match&&(String(x.data.name).trim()===name||(defaultClass&&String(x.data.defaultClass).trim()===defaultClass))))throw new Error('教師姓名或預設班別已有相同記錄。');
    if(match)sh.getRange(match.row,1,1,2).setValues([[name,defaultClass]]);
    else sh.appendRow([name,defaultClass]);
    return {name,defaultClass};
  },true);
}
function removeTeacher(token,name) {
  admin_(token);return locked_(()=>{
    const sh=sheet_('Teachers'),match=rows_(sh).find(x=>String(x.data.name).trim()===String(name||'').trim());
    if(!match)throw new Error('找不到教師，請重新載入名單。');
    sh.deleteRow(match.row);return true;
  },true);
}
function actions_() { return rows_(sheet_('Actions'),['time']).map(({row,data:d})=>({row,id:String(d.id),title:String(d.title),date:dateText_(d.date),time:String(d.time||'').replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1'),grade:String(d.grade),coordinatorName:String(d.coordinatorName),status:String(d.status),classes:json_(d.classesJson,[]),createdAt:String(d.createdAt),updatedAt:String(d.updatedAt)})); }
function action_(id) { const a=actions_().find(x=>x.id===id);if(!a)throw new Error('找不到行動。');return a; }
function allAssignments_() {return rows_(sheet_('Assignments')).map(({row,data:d})=>({row,actionId:String(d.actionId),classId:String(d.classId),label:String(d.label),teacherName:String(d.teacherName),sampleCount:Number(d.sampleCount),roster:json_(d.rosterJson,[]),selected:json_(d.selectedJson,[]),replacementLog:json_(d.replacementJson,[])}));}
function assignments_(id) {return allAssignments_().filter(x=>x.actionId===id);}
function assignment_(id,classId) {let a=assignments_(id).find(x=>x.classId===classId);if(!a)throw new Error('找不到班別。');return a;}
function allRecords_() {return rows_(sheet_('Records')).map(({row,data:d})=>({row,actionId:String(d.actionId),classId:String(d.classId),studentId:String(d.studentId),result:String(d.result),issues:json_(d.issuesJson,[]),remarks:String(d.remarks||''),followUp:d.followUp===true||String(d.followUp).toLowerCase()==='true',followDate:dateText_(d.followDate),followNotes:String(d.followNotes||''),checkedBy:String(d.checkedBy),checkedAt:String(d.checkedAt)}));}
function records_(id) {return allRecords_().filter(x=>x.actionId===id);}
function previousFollowUps_(a,visibleAssignments,allActions,allAssignments,allRecords) {
  const priorActions=allActions.filter(x=>x.row<a.row).sort((x,y)=>y.row-x.row);
  return visibleAssignments.flatMap(current=>{
    const previous=priorActions.find(x=>x.classes.some(c=>c.label===current.label));
    if(!previous)return [];
    const c=allAssignments.find(x=>x.actionId===previous.id&&x.label===current.label);
    if(!c)return [];
    const students=new Map(c.roster.map(s=>[s.id,s]));
    return allRecords.filter(r=>r.actionId===previous.id&&r.classId===c.classId&&r.followUp).map(r=>{
      const student=students.get(r.studentId);
      if(!student)return null;
      return {classLabel:c.label,number:student.number||'',name:student.name,
        followDate:r.followDate,followNotes:r.followNotes,
        previousActionTitle:previous.title,previousActionDate:previous.date};
    }).filter(Boolean);
  });
}
function view_(a,as,rs) {
  const completed=new Set(rs.filter(r=>r.result).map(r=>r.classId+':'+r.studentId));
  const progress=Object.fromEntries(as.map(c=>{let checked=c.selected.filter(id=>completed.has(c.classId+':'+id)).length;return[c.classId,{total:c.sampleCount,checked,done:c.selected.length===c.sampleCount&&checked===c.sampleCount}]}));
  return {id:a.id,title:a.title,date:a.date,time:a.time,grade:a.grade,coordinatorName:a.coordinatorName,status:a.status,classes:a.classes,progress,createdAt:a.createdAt};
}
function getAppState(token,teacherName,actionId) {
  const session=session_(token),role=session.role,admin=role==='admin',name=admin?'':session.name?teacher_(teacherName,token):'';
  const state=cached_('state:'+role+':'+name,()=>{
    const all=actions_(),teacherOptions=admin?[]:[...new Set(all.flatMap(a=>a.classes.map(c=>c.teacherName)))].filter(Boolean).sort();
    if(!admin&&!name)return {admin:false,teacherName:'',teacherOptions,actions:[]};
    const asById=new Map(),rsById=new Map();
    rows_(sheet_('Assignments')).forEach(({data:d})=>{const id=String(d.actionId),list=asById.get(id)||[];list.push({classId:String(d.classId),sampleCount:Number(d.sampleCount),selected:json_(d.selectedJson,[])});asById.set(id,list)});
    rows_(sheet_('Records')).forEach(({data:d})=>{const id=String(d.actionId),list=rsById.get(id)||[];list.push({classId:String(d.classId),studentId:String(d.studentId),result:String(d.result)});rsById.set(id,list)});
    const actions=all.filter(a=>access_(a,role,name)).map(a=>view_(a,asById.get(a.id)||[],rsById.get(a.id)||[])).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
    return {admin,teacherName:name,teacherOptions,actions,directory:admin?getDirectory(token):undefined};
  },20);
  return actionId?{...state,detail:getAction(token,actionId)}:state;
}
function getAction(token,id,teacherName) {
  const role=role_(token),name=teacher_(teacherName,token);
  const detail=cached_('action:'+String(id),()=>{
    const allActions=actions_(),a=allActions.find(x=>x.id===String(id));
    if(!a)throw new Error('找不到行動。');
    const allAssignments=allAssignments_(),allRecords=allRecords_();
    const as=allAssignments.filter(x=>x.actionId===a.id),rs=allRecords.filter(x=>x.actionId===a.id);
    return {a,as,rs,priorFollowUps:previousFollowUps_(a,as,allActions,allAssignments,allRecords)};
  },20);
  const {a,as,rs,priorFollowUps}=detail;if(!access_(a,role,name))throw new Error('你未獲指派參與此行動。');
  const canLead=lead_(a,role,name);
  const visibleAssignments=as.filter(c=>canLead||c.teacherName===name);
  const visibleLabels=new Set(visibleAssignments.map(c=>c.label));
  return {action:view_(a,as,rs),assignments:visibleAssignments.map(c=>({classId:c.classId,label:c.label,teacherName:c.teacherName,sampleCount:c.sampleCount,roster:c.roster,selected:c.selected,replacementLog:c.replacementLog,records:Object.fromEntries(rs.filter(r=>r.classId===c.classId).map(r=>[r.studentId,{result:r.result,issues:r.issues,remarks:r.remarks,followUp:r.followUp,followDate:r.followDate,followNotes:r.followNotes,checkedBy:r.checkedBy,checkedAt:r.checkedAt}]))})),priorFollowUps:priorFollowUps.filter(x=>visibleLabels.has(x.classLabel)),canLead};
}
function deleteAction(token,id) {
  admin_(token);return locked_(()=>{
    const a=action_(String(id));
    ['Records','Assignments'].forEach(name=>{
      const sh=sheet_(name);
      rows_(sh).filter(x=>String(x.data.actionId)===a.id)
        .map(x=>x.row).sort((x,y)=>y-x).forEach(row=>sh.deleteRow(row));
    });
    sheet_('Actions').deleteRow(a.row);
    return true;
  });
}
function createAction(token,payload) {
  admin_(token);return locked_(()=>{
    const p=payload||{},id=Utilities.getUuid(),title=bounded_(p.title,100),date=String(p.date||''),time=String(p.time||''),grade=bounded_(p.grade,30),coordinatorName=bounded_(p.coordinatorName,60);
    if(!rows_(sheet_('Teachers')).some(x=>String(x.data.name).trim()===coordinatorName))throw new Error('請從教師名單選擇統籌人。');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('日期或時間格式錯誤。');
    if(!Array.isArray(p.classes)||p.classes.length<1||p.classes.length>15)throw new Error('每次須有 1 至 15 班。');
    const teacherNames=new Set(rows_(sheet_('Teachers')).map(x=>String(x.data.name).trim()));
    const studentsByClass=rows_(sheet_('Students')).map(x=>x.data);
    const used=new Set(),cls=p.classes.map((c,i)=>{let label=bounded_(c.label,20),teacherName=bounded_(c.teacherName,80),roster=studentsByClass.filter(s=>String(s.class).trim()===label),n=Number(c.sampleCount);
      if(!teacherNames.has(teacherName))throw new Error(label+'：請從教師名單選擇負責老師。');
      if(used.has(label))throw new Error('班別不能重複。');used.add(label);
      if(roster.length<1||roster.length>60||!Number.isInteger(n)||n<1||n>roster.length)throw new Error(label+'：抽查人數或學生人數不合規格。');
      const students=roster.map(x=>{const raw=typeof x==='string'?String(x):String(x?.name||'');const number=typeof x==='string'?'':String(x?.number||'').trim();return {number: number?bounded_(number,20):'',name:bounded_(raw,80)};});
      if(new Set(students.map(x=>x.number||x.name)).size!==students.length)throw new Error(label+'：學生名單有重複學號或姓名。');
      return{id:'c'+(i+1),label,teacherName,sampleCount:n,roster:students.map((s,k)=>({id:'s'+(k+1),...s}))};});
    const stamp=now_();sheet_('Actions').appendRow([id,title,date,time,grade,coordinatorName,'active',JSON.stringify(cls.map(({id,label,teacherName})=>({id,label,teacherName}))),stamp,stamp]);
    const sh=sheet_('Assignments');cls.forEach(c=>sh.appendRow([id,c.id,c.label,c.teacherName,c.sampleCount,JSON.stringify(c.roster),'[]','[]',stamp]));
    return id;
  });
}
function editable_(token,id,classId,teacherName) {
  const name=teacher_(teacherName,token),a=action_(id),c=assignment_(id,classId);
  if(a.status!=='active'||!name||c.teacherName!==name)throw new Error('此行動已結束，或你不是該班負責老師。');return{a,c,name};
}
function pick_(roster,n) {return roster.map(s=>({id:s.id,key:Utilities.getUuid()})).sort((a,b)=>a.key.localeCompare(b.key)).slice(0,n).map(x=>x.id);}
function drawStudents(token,id,classId,fast) {admin_(token);const result=locked_(()=>{const a=action_(String(id)),c=assignment_(String(id),String(classId));if(a.status!=='active'||c.selected.length)throw new Error('此班已抽籤，或行動已結束。');const chosen=pick_(c.roster,c.sampleCount);const sh=sheet_('Assignments');sh.getRange(c.row,7).setValue(JSON.stringify(chosen));sh.getRange(c.row,9).setValue(now_());return {classId:c.classId,selected:chosen};});return fast===true?result:getAction(token,id);}
function replaceAbsent(token,id,classId,studentId,teacherName,fast) {const result=locked_(()=>{
  const {c,name}=editable_(token,String(id),String(classId),teacherName),sid=String(studentId),old=c.roster.find(s=>s.id===sid);
  if(!old||!c.selected.includes(sid))throw new Error('學生不在抽查名單。');
  if(records_(id).some(r=>r.classId===classId&&r.studentId===sid&&r.result))throw new Error('已有檢查結果，不能標記缺席。');
  const excluded=new Set([...c.selected,...c.replacementLog.map(x=>x.out)]),available=c.roster.filter(s=>!excluded.has(s.id));
  if(!available.length)throw new Error('名單內沒有其他可抽選學生。');
  const fresh=available.find(s=>s.id===pick_(available,1)[0]),time=now_();c.selected=c.selected.map(x=>x===sid?fresh.id:x);c.replacementLog.push({out:sid,outName:old.name,in:fresh.id,inName:fresh.name,at:time,by:name});
  const sh=sheet_('Assignments');sh.getRange(c.row,7).setValue(JSON.stringify(c.selected));sh.getRange(c.row,8).setValue(JSON.stringify(c.replacementLog));sh.getRange(c.row,9).setValue(time);
  return {classId:c.classId,selected:c.selected,replacementLog:c.replacementLog};
});return fast===true?result:getAction(token,id,teacherName);}
function saveResult(token,id,classId,studentId,data,teacherName,fast) {const result=locked_(()=>{
  const {c,name}=editable_(token,String(id),String(classId),teacherName),sid=String(studentId),v=data||{};
  if(!c.selected.includes(sid))throw new Error('學生不在當前抽查名單。');
  if(!['ok','issue','absent'].includes(v.result))throw new Error('請選擇檢查結果。');
  const issues=v.result==='issue'&&Array.isArray(v.issues)?[...new Set(v.issues)]:[];
  if(v.result==='issue'&&(!issues.length||issues.some(x=>!ISSUES_.includes(x))))throw new Error('請選擇最少一項有效問題。');
  const absent=v.result==='absent',remarks=absent?'':String(v.remarks||'').trim(),followUp=!absent&&v.followUp===true,followDate=followUp?String(v.followDate||''):'',followNotes=followUp?String(v.followNotes||'').trim():'';
  if(remarks.length>1000||followNotes.length>1000)throw new Error('備註不可超過 1000 字。');
  if(followUp&&(!/^\d{4}-\d{2}-\d{2}$/.test(followDate)||!followNotes))throw new Error('請填妥跟進日期及備註。');
  const checkedAt=now_(),row=[id,classId,sid,v.result,JSON.stringify(issues),remarks,followUp,followDate,followNotes,name,checkedAt],sh=sheet_('Records');
  const existing=records_(id).find(r=>r.classId===classId&&r.studentId===sid);
  if(existing)sh.getRange(existing.row,1,1,row.length).setValues([row]);else sh.appendRow(row);
  return {classId:c.classId,studentId:sid,record:{result:v.result,issues,remarks,followUp,followDate,followNotes,checkedBy:name,checkedAt}};
});return fast===true?result:getAction(token,id,teacherName);}
function setActionStatus(token,id,status,teacherName) {admin_(token);return locked_(()=>{
  const a=action_(String(id));
  if(!['active','completed'].includes(status))throw new Error('狀態無效。');
  if(status==='completed'){const p=view_(a,assignments_(a.id),records_(a.id)).progress;if(a.classes.some(c=>!p[c.id]||!p[c.id].done))throw new Error('仍有班別未完成。');}
  sheet_('Actions').getRange(a.row,7).setValue(status);sheet_('Actions').getRange(a.row,10).setValue(now_());return true;
});}
