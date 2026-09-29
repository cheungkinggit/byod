/** BYOD iPad 抽查系統 — Google Apps Script / HTML Service. */
const HEADERS_ = {
  Actions: ['id','title','date','time','grade','coordinatorName','coordinatorEmail','status','classesJson','createdAt','updatedAt'],
  Assignments: ['actionId','classId','label','teacherEmail','sampleCount','rosterJson','selectedJson','replacementJson','updatedAt'],
  Records: ['actionId','classId','studentId','result','issuesJson','remarks','followUp','followDate','followNotes','checkedBy','checkedAt'],
  Students: ['class','number','name'],
  Teachers: ['name','email','defaultClass']
};
const ISSUES_ = ['使用時間過長','不恰當資料（相片／影片）','觀看視頻過多（如 YouTube）','其他問題'];
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('BYOD iPad 抽查系統').addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function email_() {
  const address = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!address) throw new Error('無法辨認學校 Google 帳戶。請用同一 Google Workspace 網域登入，並檢查網頁部署設定。');
  const domain = String(PropertiesService.getScriptProperties().getProperty('SCHOOL_DOMAIN') || '').trim().toLowerCase();
  if (!domain || address.split('@')[1] !== domain) throw new Error('此帳戶不屬於已設定的學校網域。');
  return address;
}
function isAdmin_(address) {
  return String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '')
    .split(',').map(x=>x.trim().toLowerCase()).includes(address);
}
function admin_() { const address=email_(); if (!isAdmin_(address)) throw new Error('只有管理員可以執行此操作。'); return address; }
function lead_(action,address) { return isAdmin_(address) || action.coordinatorEmail === address; }
function access_(action,address) { return lead_(action,address) || action.classes.some(x=>x.teacherEmail===address); }
function store_() {
  const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('尚未設定 SPREADSHEET_ID。');
  return SpreadsheetApp.openById(id);
}
function rows_(sheet) {
  const values=sheet.getDataRange().getValues(), keys=values.shift() || [];
  return values.map((row,i)=>({row:i+2,data:Object.fromEntries(keys.map((k,j)=>[k,row[j]]))})).filter(x=>x.data[keys[0]]);
}
function sheet_(name) { const sh=store_().getSheetByName(name); if (!sh) throw new Error('缺少 '+name+' 工作表，請先執行 initializeStorage。'); return sh; }
function json_(v,fallback) { try { return JSON.parse(String(v)); } catch(e) { return fallback; } }
function dateText_(v) { return v instanceof Date ? Utilities.formatDate(v,'Asia/Hong_Kong','yyyy-MM-dd') : String(v || ''); }
function now_() { return Utilities.formatDate(new Date(),'Asia/Hong_Kong','yyyy-MM-dd HH:mm:ss'); }
function bounded_(v,n) { const s=String(v || '').trim(); if (!s || s.length>n) throw new Error('資料不可留空，長度上限 '+n+' 字。'); return s; }
function mail_(v) {
  const s=String(v || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.split('@')[1] !== PropertiesService.getScriptProperties().getProperty('SCHOOL_DOMAIN').toLowerCase())
    throw new Error('請輸入學校網域的老師電郵。');
  return s;
}
function locked_(fn) { const l=LockService.getScriptLock(); l.waitLock(15000); try { const out=fn(); SpreadsheetApp.flush(); return out; } finally { l.releaseLock(); } }
function initializeStorage() {
  admin_(); const ss=store_();
  Object.keys(HEADERS_).forEach(name=>{let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);if(sh.getLastRow()===0)sh.appendRow(HEADERS_[name]);});
  return '已建立系統工作表。';
}
function getDirectory() {
  admin_();
  const students=rows_(sheet_('Students')).map(({data:d})=>({classLabel:String(d.class||'').trim(),number:String(d.number||'').trim(),name:String(d.name||'').trim()}));
  const teachers=rows_(sheet_('Teachers')).map(({data:d})=>({name:String(d.name||'').trim(),email:String(d.email||'').trim().toLowerCase(),defaultClass:String(d.defaultClass||'').trim()}));
  return {students,teachers};
}
function actions_() { return rows_(sheet_('Actions')).map(({row,data:d})=>({row,id:String(d.id),title:String(d.title),date:dateText_(d.date),time:String(d.time||''),grade:String(d.grade),coordinatorName:String(d.coordinatorName),coordinatorEmail:String(d.coordinatorEmail).toLowerCase(),status:String(d.status),classes:json_(d.classesJson,[]),createdAt:String(d.createdAt),updatedAt:String(d.updatedAt)})); }
function action_(id) { const a=actions_().find(x=>x.id===id);if(!a)throw new Error('找不到行動。');return a; }
function assignments_(id) {return rows_(sheet_('Assignments')).filter(x=>String(x.data.actionId)===id).map(({row,data:d})=>({row,actionId:String(d.actionId),classId:String(d.classId),label:String(d.label),teacherEmail:String(d.teacherEmail).toLowerCase(),sampleCount:Number(d.sampleCount),roster:json_(d.rosterJson,[]),selected:json_(d.selectedJson,[]),replacementLog:json_(d.replacementJson,[])}));}
function assignment_(id,classId) {let a=assignments_(id).find(x=>x.classId===classId);if(!a)throw new Error('找不到班別。');return a;}
function records_(id) {return rows_(sheet_('Records')).filter(x=>String(x.data.actionId)===id).map(({row,data:d})=>({row,actionId:String(d.actionId),classId:String(d.classId),studentId:String(d.studentId),result:String(d.result),issues:json_(d.issuesJson,[]),remarks:String(d.remarks||''),followUp:d.followUp===true||String(d.followUp).toLowerCase()==='true',followDate:dateText_(d.followDate),followNotes:String(d.followNotes||''),checkedBy:String(d.checkedBy),checkedAt:String(d.checkedAt)}));}
function view_(a,as,rs) {
  const progress=Object.fromEntries(as.map(c=>{let checked=c.selected.filter(id=>rs.some(r=>r.classId===c.classId&&r.studentId===id&&r.result)).length;return[c.classId,{total:c.sampleCount,checked,done:c.selected.length===c.sampleCount&&checked===c.sampleCount}]}));
  return {id:a.id,title:a.title,date:a.date,time:a.time,grade:a.grade,coordinatorName:a.coordinatorName,coordinatorEmail:a.coordinatorEmail,status:a.status,classes:a.classes,progress,createdAt:a.createdAt};
}
function getAppState() {
  const address=email_(), admin=isAdmin_(address), all=actions_();
  const aRows=rows_(sheet_('Assignments')),rRows=rows_(sheet_('Records'));
  const list=all.filter(a=>admin||access_(a,address)).map(a=>{
    const as=aRows.filter(x=>String(x.data.actionId)===a.id).map(({data:d})=>({classId:String(d.classId),sampleCount:Number(d.sampleCount),selected:json_(d.selectedJson,[])}));
    const rs=rRows.filter(x=>String(x.data.actionId)===a.id).map(({data:d})=>({classId:String(d.classId),studentId:String(d.studentId),result:String(d.result)}));
    return view_(a,as,rs);
  }).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
  return {email:address,admin,actions:list};
}
function getAction(id) {
  const address=email_(),a=action_(String(id));if(!access_(a,address))throw new Error('你未獲指派參與此行動。');
  const as=assignments_(a.id),rs=records_(a.id),canLead=lead_(a,address);
  return {action:view_(a,as,rs),assignments:as.filter(c=>canLead||c.teacherEmail===address).map(c=>({classId:c.classId,label:c.label,teacherEmail:c.teacherEmail,sampleCount:c.sampleCount,roster:c.roster,selected:c.selected,replacementLog:c.replacementLog,records:Object.fromEntries(rs.filter(r=>r.classId===c.classId).map(r=>[r.studentId,{result:r.result,issues:r.issues,remarks:r.remarks,followUp:r.followUp,followDate:r.followDate,followNotes:r.followNotes,checkedBy:r.checkedBy,checkedAt:r.checkedAt}]))})),canLead};
}
function createAction(payload) {
  admin_();return locked_(()=>{
    const p=payload||{},id=Utilities.getUuid(),title=bounded_(p.title,100),date=String(p.date||''),time=String(p.time||''),grade=bounded_(p.grade,30),coordinatorName=bounded_(p.coordinatorName,60),coordinatorEmail=mail_(p.coordinatorEmail);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('日期或時間格式錯誤。');
    if(!Array.isArray(p.classes)||p.classes.length<1||p.classes.length>15)throw new Error('每次須有 1 至 15 班。');
    const used=new Set(),cls=p.classes.map((c,i)=>{let label=bounded_(c.label,20),teacherEmail=mail_(c.teacherEmail),roster=Array.isArray(c.roster)?c.roster:[],n=Number(c.sampleCount);
      if(used.has(label))throw new Error('班別不能重複。');used.add(label);
      if(roster.length<1||roster.length>60||!Number.isInteger(n)||n<1||n>roster.length)throw new Error(label+'：抽查人數或學生人數不合規格。');
      const students=roster.map(x=>{const raw=typeof x==='string'?String(x):String(x?.name||'');const number=typeof x==='string'?'':String(x?.number||'').trim();return {number: number?bounded_(number,20):'',name:bounded_(raw,80)};});
      if(new Set(students.map(x=>x.number||x.name)).size!==students.length)throw new Error(label+'：學生名單有重複學號或姓名。');
      return{id:'c'+(i+1),label,teacherEmail,sampleCount:n,roster:students.map((s,k)=>({id:'s'+(k+1),...s}))};});
    const stamp=now_();sheet_('Actions').appendRow([id,title,date,time,grade,coordinatorName,coordinatorEmail,'active',JSON.stringify(cls.map(({id,label,teacherEmail})=>({id,label,teacherEmail}))),stamp,stamp]);
    const sh=sheet_('Assignments');cls.forEach(c=>sh.appendRow([id,c.id,c.label,c.teacherEmail,c.sampleCount,JSON.stringify(c.roster),'[]','[]',stamp]));
    return id;
  });
}
function editable_(id,classId) {
  const address=email_(),a=action_(id),c=assignment_(id,classId);
  if(a.status!=='active'||c.teacherEmail!==address)throw new Error('此行動已結束，或你不是該班負責老師。');return{a,c,address};
}
function pick_(roster,n) {return roster.map(s=>({id:s.id,key:Utilities.getUuid()})).sort((a,b)=>a.key.localeCompare(b.key)).slice(0,n).map(x=>x.id);}
function drawStudents(id,classId) {return locked_(()=>{const {c}=editable_(String(id),String(classId));if(c.selected.length)throw new Error('這班已經抽樣。');const chosen=pick_(c.roster,c.sampleCount);const sh=sheet_('Assignments');sh.getRange(c.row,7).setValue(JSON.stringify(chosen));sh.getRange(c.row,9).setValue(now_());SpreadsheetApp.flush();return getAction(id);});}
function replaceAbsent(id,classId,studentId) {return locked_(()=>{
  const {c,address}=editable_(String(id),String(classId)),sid=String(studentId),old=c.roster.find(s=>s.id===sid);
  if(!old||!c.selected.includes(sid))throw new Error('學生不在抽查名單。');
  if(records_(id).some(r=>r.classId===classId&&r.studentId===sid&&r.result))throw new Error('已有檢查結果，不能標記缺席。');
  const excluded=new Set([...c.selected,...c.replacementLog.map(x=>x.out)]),available=c.roster.filter(s=>!excluded.has(s.id));
  if(!available.length)throw new Error('名單內沒有其他可抽選學生。');
  const fresh=available.find(s=>s.id===pick_(available,1)[0]),time=now_();c.selected=c.selected.map(x=>x===sid?fresh.id:x);c.replacementLog.push({out:sid,outName:old.name,in:fresh.id,inName:fresh.name,at:time,by:address});
  const sh=sheet_('Assignments');sh.getRange(c.row,7).setValue(JSON.stringify(c.selected));sh.getRange(c.row,8).setValue(JSON.stringify(c.replacementLog));sh.getRange(c.row,9).setValue(time);SpreadsheetApp.flush();return getAction(id);
});}
function saveResult(id,classId,studentId,data) {return locked_(()=>{
  const {c,address}=editable_(String(id),String(classId)),sid=String(studentId),v=data||{};
  if(!c.selected.includes(sid))throw new Error('學生不在當前抽查名單。');
  if(!['ok','issue'].includes(v.result))throw new Error('請選擇檢查結果。');
  const issues=v.result==='issue'&&Array.isArray(v.issues)?[...new Set(v.issues)]:[];
  if(v.result==='issue'&&(!issues.length||issues.some(x=>!ISSUES_.includes(x))))throw new Error('請選擇最少一項有效問題。');
  const remarks=String(v.remarks||'').trim(),followUp=v.followUp===true,followDate=followUp?String(v.followDate||''):'',followNotes=followUp?String(v.followNotes||'').trim():'';
  if(remarks.length>1000||followNotes.length>1000)throw new Error('備註不可超過 1000 字。');
  if(followUp&&(!/^\d{4}-\d{2}-\d{2}$/.test(followDate)||!followNotes))throw new Error('請填妥跟進日期及備註。');
  const row=[id,classId,sid,v.result,JSON.stringify(issues),remarks,followUp,followDate,followNotes,address,now_()],sh=sheet_('Records');
  const existing=records_(id).find(r=>r.classId===classId&&r.studentId===sid);
  if(existing)sh.getRange(existing.row,1,1,row.length).setValues([row]);else sh.appendRow(row);
  SpreadsheetApp.flush();return getAction(id);
});}
function setActionStatus(id,status) {return locked_(()=>{
  const address=email_(),a=action_(String(id));if(!lead_(a,address))throw new Error('只有統籌或管理員可結束行動。');
  if(!['active','completed'].includes(status))throw new Error('狀態無效。');
  if(status==='completed'){let detail=getAction(id),p=detail.action.progress;if(a.classes.some(c=>!p[c.id]||!p[c.id].done))throw new Error('仍有班別未完成。');}
  sheet_('Actions').getRange(a.row,8).setValue(status);sheet_('Actions').getRange(a.row,11).setValue(now_());return true;
});}
