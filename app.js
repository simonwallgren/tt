(function(){
"use strict";
/* Morning and evening adhkar: Hisn al-Muslim, chapter 27, loaded from adhkar.js. */
var ADHKAR=Array.isArray(window.ADHKAR)?window.ADHKAR:[];
var DEFAULT_MUST=[75,76,79,86,97];
var DEFAULT_HABITS=[
 {id:"fajr",label:"Fajr on time",group:"Worship"},
 {id:"salah",label:"All five prayers on time",group:"Worship"},
 {id:"adhkar_am",label:"Morning adhkar",group:"Worship"},
 {id:"adhkar_pm",label:"Evening adhkar",group:"Worship"},
 {id:"quran",label:"Quran, at least one page",group:"Worship"},
 {id:"device",label:"No device in bed or when alone",group:"Protection"},
 {id:"gaze",label:"Lowered my gaze",group:"Protection"},
 {id:"wudu_sleep",label:"Wudu and adhkar before sleep",group:"Protection"},
 {id:"move",label:"Trained or walked for 20 minutes",group:"Lifestyle"},
 {id:"dua",label:"Made dua for steadfastness",group:"Lifestyle"}
];
var DEFAULT_PLAN=["Bismillah.","Put the phone away, in another room.","Make wudu.","Pray two rak'ah.","Go out for a walk."];
/* Quran: Sahih International. Hadith: common English renderings, with collection and number. */
var REMINDERS=[
 {text:"“Say: O My servants who have transgressed against themselves, do not despair of the mercy of Allah. Indeed, Allah forgives all sins. Indeed, it is He who is the Forgiving, the Merciful.”",ref:"Quran 39:53"},
 {text:"“And whoever does a wrong or wrongs himself but then seeks forgiveness of Allah will find Allah Forgiving and Merciful.”",ref:"Quran 4:110"},
 {text:"“Indeed, Allah loves those who are constantly repentant and loves those who purify themselves.”",ref:"Quran 2:222"},
 {text:"“Indeed, good deeds do away with misdeeds.”",ref:"Quran 11:114"},
 {text:"“Every son of Adam sins, and the best of those who sin are those who repent.”",ref:"Hadith, Tirmidhi 2499"},
 {text:"“O son of Adam, were your sins to reach the clouds of the sky and were you then to ask forgiveness of Me, I would forgive you.”",ref:"Hadith qudsi, Tirmidhi 3540"},
 {text:"“Follow a bad deed with a good deed and it will wipe it out.”",ref:"Hadith, Tirmidhi 1987"},
 {text:"“There is no servant who commits a sin, then purifies himself well, stands and prays two rak'ah and asks Allah for forgiveness, except that Allah forgives him.”",ref:"Hadith, Abu Dawud 1521"}
];
var GROUPS=["Worship","Protection","Lifestyle"];
var STATES=["Tired","Stressed","Bored","Lonely","Angry","Hungry","Low mood","Idle scrolling","After an argument","Could not sleep"];
var PLACES=["Bedroom","Bathroom","Living room","Kitchen","Work","Travelling","Other"];
var DEVICES=["Phone","Laptop","TV","Nothing"];

var db=null, base=null, settings=null, days={}, events=[], barriers=[], dict=null, recKey=null;
var ui={view:"home", date:null, form:null, draft:null, editHabits:false, editPlan:false, ticks:{}, del:null, rec:null, rem:0, dk:{s:"m",i:0,manage:false}, tasbih:{n:0,target:33}};
var pend={}, ai=null, busyFix={}, appEl=document.querySelector(".app");
var FIX_PROMPT="You help a Muslim man protect his taqwa. He keeps a list of barriers: things set up in advance so that unwanted content cannot reach him on his phone, on his computer or at home. One barrier broke or is missing. Suggest how to fix it: at most three concrete steps he can do today, the most effective first. Prefer settings and tools that work on iPhone and on a computer and that he cannot undo in a weak moment, for example a code held by someone he trusts. Plain text only, one step per line, numbered, no headings, no markdown, under 70 words in total. Use neutral wording: say 'unwanted content', never anything explicit. Do not moralise and do not give religious rulings.\n\nBarrier: ";
var NAV=[["home","Today"],["dhikr","Dhikr"],["log","Log"],["patterns","Patterns"],["barriers","Barriers"],["edit","Edit"]], navEl=document.getElementById("nav");
var view=document.getElementById("view"), statusEl=document.getElementById("status"), fab=document.getElementById("fab");
var meter=document.getElementById("meter"), meterFill=document.getElementById("meter-fill"), meterPct=document.getElementById("meter-pct");

function h(tag,attrs){
  var e=document.createElement(tag), k, v;
  for(k in (attrs||{})){ v=attrs[k]; if(v==null||v===false) continue;
    if(k==="class") e.className=v; else if(k==="text") e.textContent=v;
    else if(k.slice(0,2)==="on") e.addEventListener(k.slice(2),v);
    else if(k==="value") e.value=v; else if(k==="checked") e.checked=!!v;
    else e.setAttribute(k,v===true?"":v); }
  var kids=Array.prototype.slice.call(arguments,2);
  (function add(list){ list.forEach(function(c){ if(c==null||c===false) return; if(Array.isArray(c)) return add(c); e.append(c.nodeType?c:document.createTextNode(String(c))); }); })(kids);
  return e;
}
function pad(n){ return (n<10?"0":"")+n; }
function iso(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
function today(){ return iso(new Date()); }
function shift(date,n){ var p=date.split("-"); var d=new Date(+p[0],+p[1]-1,+p[2]); d.setDate(d.getDate()+n); return iso(d); }
function nice(date){ var p=date.split("-"); return new Date(+p[0],+p[1]-1,+p[2]).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}); }
function nowLocal(){ var d=new Date(); return iso(d)+"T"+pad(d.getHours())+":"+pad(d.getMinutes()); }
function setStatus(t){ statusEl.textContent=t||""; }
var flashT=null;
function flash_old(t){ setStatus(t); clearTimeout(flashT); flashT=setTimeout(function(){ if(statusEl.textContent===t) setStatus(""); },1500); }

function habits(){ return (settings&&Array.isArray(settings.habits))?settings.habits:DEFAULT_HABITS; }
function plan(){ return (settings&&Array.isArray(settings.plan))?settings.plan:DEFAULT_PLAN; }
function why(){ return (settings&&settings.why)||""; }
function dayOf(date){ var d=days[date]||{};
  return Object.assign({},d,{date:date, onTrack:typeof d.onTrack==="boolean"?d.onTrack:null, habits:Object.assign({},d.habits||{}), journal:d.journal||""}); }

/* one write at a time per document, latest value wins */
var queue={};
function save(ref,key,data){
  var s=queue[key]||(queue[key]={busy:false,next:null}); s.next=data; if(s.busy) return; s.busy=true;
  (async function(){ while(s.next){ var d=s.next; s.next=null;
      try{ await ref.set(d); flash("Saved"); }
      catch(e){ setStatus(e&&e.code==="quota_exceeded"?"Storage is full. Delete old entries.":"Could not save. Check your connection."); } }
    s.busy=false; })();
}
function putDay_old(d){ d.updatedAt=new Date().toISOString(); days[d.date]=d; if(db) save(base.collection("days").doc(d.date),"day:"+d.date,d); }
function putSettings_old(patch){ settings=Object.assign({},settings||{},{habits:habits(),plan:plan(),why:why()},patch); if(db) save(base.collection("meta").doc("settings"),"settings",settings); }
/* dhikr: counts live in today's document, written a moment after the last tap */
function mustIds(){ return (settings&&Array.isArray(settings.dhikrMust))?settings.dhikrMust:DEFAULT_MUST; }
function skipIds(){ return (settings&&Array.isArray(settings.dhikrSkip))?settings.dhikrSkip:[]; }
function cards(s){ var skip=skipIds(), must=mustIds(), list=ADHKAR.filter(function(a){ return a.when.indexOf(s)>=0&&skip.indexOf(a.id)<0; });
  return list.filter(function(a){ return must.indexOf(a.id)>=0; }).concat(list.filter(function(a){ return must.indexOf(a.id)<0; })); }
function dcount(d,s,a){ return (d.dhikr&&d.dhikr[s]&&d.dhikr[s][a.id])||0; }
function firstOpen(s){ var d=dayOf(today()), list=cards(s), i; for(i=0;i<list.length;i++) if(dcount(d,s,list[i])<list[i].n) return i; return 0; }
function protection(){ var d=dayOf(today()), must=mustIds(), got=0, total=0;
  ["m","e"].forEach(function(s){ cards(s).forEach(function(a){ var w=must.indexOf(a.id)>=0?2:1; total+=w; if(dcount(d,s,a)>=a.n) got+=w; }); });
  return total?Math.round(100*got/total):0; }
function putDaySoon_old(d){ d.updatedAt=new Date().toISOString(); days[d.date]=d; pend[d.date]=true;
  later("soon:"+d.date,function(){ delete pend[d.date]; putDay(days[d.date]); }); }
function setCount(s,a,n){ var d=dayOf(today()); d.dhikr=Object.assign({},d.dhikr); d.dhikr[s]=Object.assign({},d.dhikr[s]);
  if(n>0) d.dhikr[s][a.id]=n; else delete d.dhikr[s][a.id]; putDaySoon(d); }
function openDhikr(){ var s=new Date().getHours()<15?"m":"e"; go("dhikr",{dk:{s:s,i:firstOpen(s),manage:false}}); }
function swipeable(el,onLeft,onRight){ var x0=null,y0=0,dx=0;
  el.addEventListener("touchstart",function(e){ var t=e.touches[0]; x0=t.clientX; y0=t.clientY; dx=0; },{passive:true});
  el.addEventListener("touchmove",function(e){ if(x0==null) return; var t=e.touches[0], mx=t.clientX-x0, my=t.clientY-y0;
    if(Math.abs(mx)>Math.abs(my)*1.3){ dx=mx; el.style.transform="translateX("+dx+"px)"; el.style.opacity=String(Math.max(.45,1-Math.abs(dx)/320)); } },{passive:true});
  el.addEventListener("touchend",function(){ if(x0==null) return; x0=null; el.style.transform=""; el.style.opacity="";
    if(dx<-70) onLeft(); else if(dx>70) onRight(); });
}
function addBarrier_old(text){ var doc={text:text,status:"open",createdAt:new Date().toISOString()};
  if(db) return base.collection("barriers").add(doc).then(function(ref){ flash("Saved"); return Object.assign({id:ref.id},doc); },function(){ setStatus("Could not save. Check your connection."); return null; });
  var b=Object.assign({id:"local-"+Date.now()},doc); barriers.push(b); return Promise.resolve(b); }
function patchBarrier_old(b,patch){ Object.assign(b,patch); var live=barriers.filter(function(x){ return x.id===b.id; })[0]; if(live&&live!==b) Object.assign(live,patch);
  if(db) base.collection("barriers").doc(b.id).update(Object.assign({updatedAt:new Date().toISOString()},patch)).catch(function(){ setStatus("Could not save. Check your connection."); }); }
function setBarrier(b,status){ patchBarrier(b,{status:status}); }
function suggest(b){ if(!ai||busyFix[b.id]) return; busyFix[b.id]=true; render();
  ai(FIX_PROMPT+b.text,{modelTier:"default",cache:false}).then(function(r){ var t=((r&&r.text)||"").trim(); if(t) patchBarrier(b,{fix:t.slice(0,1200)}); },
    function(e){ var c=e&&e.code; if(c==="not_granted"){ ai=null; setStatus("Suggestions are off here. Write the fix yourself."); }
      else setStatus(c==="rate_limited"?"Too many requests. Try again shortly.":"No suggestion came back. Try again."); })
  .then(function(){ delete busyFix[b.id]; soft(); }); }
var timers={};
function later(key,fn){ clearTimeout(timers[key]); timers[key]=setTimeout(fn,700); }

function go(v,opts){ ui.view=v; ui.del=null; if(opts) Object.assign(ui,opts); render(); window.scrollTo(0,0); }
function openForm(type){ go("form",{form:type,draft:null}); }
function typing(){ var a=document.activeElement; return a&&view.contains(a)&&(a.tagName==="TEXTAREA"||(a.tagName==="INPUT"&&a.type!=="checkbox")||a.tagName==="SELECT"); }
function soft(){ if(!typing()) render(); }

/* speaking an answer: only where the viewer's app offers it, typing always works */
function recUI(){ ["lead","detail"].forEach(function(k){ var b=document.getElementById("rec-"+k), l=document.getElementById("live-"+k), on=ui.rec===k;
  if(b){ b.textContent=on?"Stop recording":"Record answer"; b.setAttribute("aria-pressed",String(on)); b.classList.toggle("danger",on); }
  if(l&&!on) l.textContent=""; }); }
function stopRec(){ if(dict&&ui.rec) dict.stop().catch(function(){}); }
function toggleRec(key){
  if(!dict) return;
  if(ui.rec===key){ stopRec(); return; }
  var was=ui.rec; ui.rec=key; recKey=key; recUI();
  if(was) return;
  dict.start().catch(function(e){ var c=e&&e.code; ui.rec=null; recUI();
    if(c==="not_granted"||c==="unavailable"){ dict=null; render(); setStatus("Recording is off here. Type instead."); }
    else if(c==="rate_limited") setStatus("Recording is busy. Try again shortly.");
    else if(c!=="stopped"&&c!=="dismissed") setStatus("Recording failed. Type instead."); });
}

function render(){
  if(locked) return;
  if(ui.rec&&ui.view!=="form") stopRec();
  var v={home:viewHome,form:viewForm,back:viewBack,now:viewNow,log:viewLog,patterns:viewPatterns,barriers:viewBarriers,edit:viewEdit,dhikr:viewDhikr}[ui.view]();
  navEl.replaceChildren.apply(navEl,NAV.map(function(l){ return h("button",{type:"button","aria-current":ui.view===l[0]?"page":null,
    onclick:function(){ if(l[0]==="dhikr") openDhikr(); else if(l[0]==="home") go("home",{date:null}); else go(l[0]); }},l[1]); }));
  view.replaceChildren.apply(view,v.filter(Boolean));
  fab.hidden=ui.view==="now";
  appEl.classList.toggle("focus",ui.view==="dhikr"&&ui.dk.s!=="c"&&!ui.dk.manage);
  fitDhikr();
  var pct=protection(); meterFill.style.width=pct+"%"; meterPct.textContent=pct+"%";
  meter.hidden=!ADHKAR.length||ui.view==="now"||ui.view==="form";
}
fab.addEventListener("click",function(){ go("now",{ticks:{}}); });
meter.addEventListener("click",openDhikr);
/* the dhikr card fills the screen; its text scrolls inside it */
function fitDhikr(){ var c=document.querySelector(".dcard"); if(!c||ui.view!=="dhikr") return;
  c.style.height=Math.max(340,window.innerHeight-(c.getBoundingClientRect().top+window.scrollY)-80)+"px"; }
window.addEventListener("resize",fitDhikr);

/* ---------- Dhikr ---------- */
function viewDhikr(){
  var dk=ui.dk, s=dk.s;
  var seg=h("div",{class:"chips"},[["m","Morning"],["e","Evening"],["c","Counter"]].map(function(x){
    return h("button",{class:"chip",type:"button","aria-pressed":String(s===x[0]),onclick:function(){ ui.dk={s:x[0],i:x[0]==="c"?0:firstOpen(x[0]),manage:false}; render(); }},x[1]); }));
  if(s==="c"){ var t=ui.tasbih, hit=t.target&&t.n>=t.target;
    return [seg,h("section",{class:"card"},h("h2",null,"Counter"),
      h("div",{class:"chips"},[33,100,0].map(function(x){ return h("button",{class:"chip",type:"button","aria-pressed":String(t.target===x),onclick:function(){ t.target=x; render(); }},x?String(x):"No target"); })),
      h("button",{class:"tap big"+(hit?" full":""),type:"button","aria-label":"Count one",onclick:function(){ t.n++; render(); }},String(t.n),h("small",null,t.target?"of "+t.target:"tap")),
      h("div",null,h("button",{class:"btn small ghost",type:"button",onclick:function(){ t.n=0; render(); }},"Reset")))]; }
  if(!ADHKAR.length) return [seg,h("section",{class:"card"},h("p",{class:"muted"},"The dhikr texts did not load. Reload the page."))];
  var must=mustIds(), skip=skipIds();
  if(dk.manage){
    var tog=function(arr,id){ return arr.indexOf(id)>=0?arr.filter(function(x){ return x!==id; }):arr.concat([id]); };
    return [seg,h("section",{class:"card"},
      h("div",{class:"spread"},h("h3",null,"Cards"),h("button",{class:"btn small ghost",type:"button",onclick:function(){ dk.manage=false; dk.i=firstOpen(s); render(); }},"Done")),
      h("p",{class:"muted"},"Mark the ones that are non-negotiable for you. Skip any you do not use."),
      ADHKAR.map(function(a){ return h("div",{class:"entry"},h("p",null,a.title+(a.n>1?" ×"+a.n:"")),
        h("p",{class:"muted"},a.when==="me"?"Morning and evening":a.when==="m"?"Morning":"Evening"),
        h("div",{class:"row"},
          h("button",{class:"chip",type:"button","aria-pressed":String(must.indexOf(a.id)>=0),onclick:function(){ putSettings({dhikrMust:tog(must,a.id)}); render(); }},"Non-negotiable"),
          h("button",{class:"chip",type:"button","aria-pressed":String(skip.indexOf(a.id)>=0),onclick:function(){ putSettings({dhikrSkip:tog(skip,a.id)}); render(); }},"Skip"))); }))]; }
  var list=cards(s), d=dayOf(today());
  var doneN=list.filter(function(a){ return dcount(d,s,a)>=a.n; }).length;
  var head=h("div",{class:"spread"},h("span",{class:"muted"},(s==="m"?"Morning":"Evening")+": "+doneN+" of "+list.length+" done"),
    h("button",{class:"link",type:"button",onclick:function(){ dk.manage=true; render(); }},"Cards"));
  if(!list.length) return [seg,head,h("section",{class:"card"},h("p",{class:"muted"},"All cards are skipped. Open Cards to bring some back."))];
  if(dk.i>=list.length) dk.i=list.length-1;
  var a=list[dk.i], n=dcount(d,s,a), full=n>=a.n, isMust=must.indexOf(a.id)>=0;
  function next(){ if(dk.i<list.length-1) dk.i++; render(); }
  function doneNext(){ if(!full) setCount(s,a,a.n); next(); }
  var card=h("section",{class:"card dcard"+(isMust?" must":"")+(full?" done":"")},
    h("div",{class:"spread"},h("span",{class:"muted"},(dk.i+1)+" of "+list.length),
      h("span",{class:"row"},isMust?h("span",{class:"pill"},"Non-negotiable"):null,full?h("span",{class:"pill"},"Done"):null)),
    h("h2",null,a.title),
    h("div",{class:"dscroll"},h("p",{class:"arabic",lang:"ar",dir:"rtl"},a.ar),
      h("p",{class:"muted",style:"font-size:15px"},a.en),
      h("p",{class:"ref"},"Hisn al-Muslim, no. "+a.id+(a.note?" · "+a.note:""))),
    h("button",{class:"tap"+(full?" full":""),type:"button","aria-label":"Count one",onclick:function(){ if(n<a.n){ setCount(s,a,n+1); render(); } }},
      a.n>1?(n+" / "+a.n):(full?"Done":"Tap"),h("small",null,a.n>1?"tap to count":(full?"":"when said"))),
    h("div",{class:"spread"},
      h("button",{class:"btn small ghost",type:"button",disabled:dk.i===0,onclick:function(){ dk.i--; render(); }},"‹ Previous"),
      n?h("button",{class:"btn small ghost",type:"button",onclick:function(){ setCount(s,a,0); render(); }},"Reset"):null,
      h("button",{class:"btn small",type:"button",onclick:doneNext},full?"Next ›":"Done, next ›")));
  swipeable(card,doneNext,function(){ if(dk.i>0){ dk.i--; render(); } });
  return [seg,head,card];
}

function reminder(title){ var r=REMINDERS[ui.rem%REMINDERS.length];
  return h("section",{class:"card"},title?h("h2",null,title):h("h3",null,"Come back"),
    h("p",{class:"quote"},r.text),h("p",{class:"ref"},r.ref),
    h("div",null,h("button",{class:"btn small ghost",type:"button",onclick:function(){ ui.rem++; render(); }},"Another"))); }
function checks(items,isOn,onToggle,prefix){ return h("div",null,items.map(function(x,i){
  return h("label",{class:"check"},h("input",{type:"checkbox",id:prefix+i,checked:isOn(x,i),onchange:function(ev){ onToggle(x,i,ev.target.checked); }}),h("span",null,x.label||x)); })); }

/* ---------- Home ---------- */
function viewHome(){
  var t=today(), date=ui.date||t, d=dayOf(date), list=habits(), done=list.filter(function(x){ return d.habits[x.id]; }).length;
  function logFor(type){ go("form",{form:type,draft:{at:date===t?nowLocal():date+"T12:00",place:"",device:"",states:[],lead:"",detail:"",next:"",barrierId:""}}); }
  function answer(val){ var was=d.onTrack; d.onTrack=(was===val?null:val); putDay(d); if(val===false&&was!==false) logFor("off"); else render(); }
  var groups=GROUPS.concat(list.map(function(x){ return x.group; }).filter(function(g,i,a){ return GROUPS.indexOf(g)<0&&a.indexOf(g)===i; }));
  var grid=[], i; for(i=34;i>=0;i--) grid.push((function(k){ var o=days[k]&&days[k].onTrack;
    return h("button",{class:"cell"+(o===true?" on":o===false?" off":"")+(k===date?" sel":""),type:"button","aria-label":nice(k),onclick:function(){ go("home",{date:k}); }},+k.slice(8)); })(shift(t,-i)));
  return [
    h("div",{class:"datenav"},
      h("button",{class:"btn small ghost",type:"button","aria-label":"Previous day",onclick:function(){ ui.date=shift(date,-1); render(); }},"‹"),
      h("strong",null,date===t?"Today, "+nice(date):nice(date)),
      h("button",{class:"btn small ghost",type:"button","aria-label":"Next day",disabled:date>=t,onclick:function(){ ui.date=shift(date,1); render(); }},"›")),
    h("section",{class:"card"},
      h("h2",null,date===t?"Were you on taqwa track today?":"Were you on taqwa track this day?"),
      h("div",{class:"answer"},
        h("button",{class:"btn yes",type:"button","aria-pressed":String(d.onTrack===true),onclick:function(){ answer(true); }},"Yes"),
        h("button",{class:"btn no",type:"button","aria-pressed":String(d.onTrack===false),onclick:function(){ answer(false); }},"No")),
      d.onTrack===true?h("div",{class:"row",style:"justify-content:space-between"},h("p",{class:"muted"},"Alhamdulillah."),
        h("button",{class:"btn small ghost",type:"button",onclick:function(){ logFor("pass"); }},"Hawa came, I held. Log it")):null,
      d.onTrack===false?h("div",null,h("button",{class:"btn small ghost",type:"button",onclick:function(){ logFor("off"); }},"Log the fall")):null),
    d.onTrack===false?reminder():null,
    h("section",{class:"card"},
      h("div",{class:"spread"},h("h3",null,"Taqwa habits"),h("span",{class:"muted"},done+" of "+list.length)),
      groups.map(function(g){ var items=list.filter(function(x){ return x.group===g; }); if(!items.length) return null;
        return h("div",{class:"group"},h("span",{class:"muted"},g),
          checks(items,function(x){ return !!d.habits[x.id]; },function(x,i,on){ if(on) d.habits[x.id]=true; else delete d.habits[x.id]; putDay(d); render(); },"hb-"+g+"-")); })),
    h("section",{class:"card"},h("h3",null,"Note for the day"),
      h("textarea",{id:"journal","aria-label":"Note for the day",value:d.journal,placeholder:"A few honest lines are enough.",
        oninput:function(ev){ d.journal=ev.target.value; later("day",function(){ putDay(d); }); }})),
    h("section",{class:"card"},h("h3",null,"Last five weeks"),h("div",{class:"grid"},grid),
      h("p",{class:"muted"},"Filled: on track. Amber: fell. Tap a day to open it.")),
    null
  ];
}

/* ---------- Log form ---------- */
function chipSet(options,selected,onchange,single){
  return h("div",{class:"chips"},options.map(function(o){ var on=single?selected===o:selected.indexOf(o)>=0;
    return h("button",{class:"chip",type:"button","aria-pressed":String(on),onclick:function(){ onchange(o,on); render(); }},o); }));
}
function viewForm(){
  var f=ui.form||"off", dr=ui.draft||(ui.draft={at:nowLocal(),place:"",device:"",states:[],lead:"",detail:"",next:"",barrierId:""});
  function field(id,label,key,ph){ return h("div",{class:"block"},
    h("label",{class:"field"},label,h("textarea",{id:id,placeholder:ph||"",value:dr[key],oninput:function(ev){ dr[key]=ev.target.value; }})),
    dict?h("div",{class:"row"},
      h("button",{class:"btn small"+(ui.rec===key?" danger":""),type:"button",id:"rec-"+key,"aria-pressed":String(ui.rec===key),onclick:function(){ toggleRec(key); }},ui.rec===key?"Stop recording":"Record answer"),
      h("span",{class:"muted",id:"live-"+key,"aria-live":"polite"})):null); }
  async function submit(){
    if(!dr.at) return setStatus("Choose a date and time.");
    var b=barriers.filter(function(x){ return x.id===dr.barrierId; })[0], next=dr.next.trim();
    var doc={type:f,at:dr.at,date:dr.at.slice(0,10),hour:+dr.at.slice(11,13)||0,place:dr.place,device:dr.device,states:dr.states.slice(),lead:dr.lead.trim(),detail:dr.detail.trim(),next:next,barrierId:b?b.id:"",barrier:b?b.text:"",createdAt:new Date().toISOString()};
    addEvent(doc);
    if(next) addBarrier(next);
    if(f==="off"){ if(b&&b.status!=="open") setBarrier(b,"open");
      var d=dayOf(doc.date); if(d.onTrack!==false){ d.onTrack=false; putDay(d); } }
    go(f==="off"?"back":"home",{form:null,draft:null,rem:ui.rem+1});
  }
  return [h("section",{class:"card"},
    h("h2",null,f==="off"?"I fell.":"Hawa came. I held."),
    h("label",{class:"field"},"When",h("input",{type:"datetime-local",id:"ev-at",value:dr.at,oninput:function(ev){ dr.at=ev.target.value; }})),
    h("div",{class:"block"},h("span",{class:"muted"},"Where"),chipSet(PLACES,dr.place,function(o,on){ dr.place=on?"":o; },true)),
    h("div",{class:"block"},h("span",{class:"muted"},"In front of me"),chipSet(DEVICES,dr.device,function(o,on){ dr.device=on?"":o; },true)),
    h("div",{class:"block"},h("span",{class:"muted"},"How I felt just before"),chipSet(STATES,dr.states,function(o,on){ if(on) dr.states=dr.states.filter(function(x){ return x!==o; }); else dr.states.push(o); })),
    field("ev-lead","Why: what led up to it?","lead","The hour before. What I was doing, what I skipped."),
    f==="off"?field("ev-detail","How it happened","detail","The steps, in order. Only facts."):field("ev-detail","What helped me hold?","detail"),
    f==="off"?h("div",{class:"block"},h("span",{class:"muted"},"Barrier that broke"),
      barriers.length?h("div",{class:"chips"},barriers.map(function(b){ var on=dr.barrierId===b.id;
        return h("button",{class:"chip",type:"button","aria-pressed":String(on),onclick:function(){ dr.barrierId=on?"":b.id; render(); }},b.text); }))
        :h("p",{class:"muted"},"No barriers yet. Name the missing one below.")):null,
    h("label",{class:"field"},f==="off"?"New barrier to set up":"New barrier, if this showed a gap",
      h("input",{type:"text",id:"ev-next",value:dr.next,placeholder:"One concrete thing that closes this path.",oninput:function(ev){ dr.next=ev.target.value; }})),
    h("div",{class:"row"},h("button",{class:"btn primary",type:"button",onclick:submit},"Save"),
      h("button",{class:"btn ghost",type:"button",onclick:function(){ go("home",{form:null,draft:null}); }},"Cancel")))];
}

/* ---------- After a fall ---------- */
function viewBack(){
  var open=barriers.filter(function(b){ return b.status==="open"; }).length;
  return [
    reminder("You fell. Come back now."),
    h("section",{class:"card"},h("h3",null,"Next"),
      h("p",null,"Make wudu and pray two rak'ah."),
      h("p",null,"Ask for forgiveness, then do one good deed today."),
      h("p",null,open?"Fix the barrier that broke. "+open+" open.":"Name the barrier that was missing."),
      h("div",{class:"row"},
        h("button",{class:"btn primary",type:"button",onclick:function(){ go("barriers"); }},"Barriers"),
        h("button",{class:"btn ghost",type:"button",onclick:function(){ go("home"); }},"Back to today")))
  ];
}

/* ---------- Right now ---------- */
function viewNow(){
  var steps=plan();
  return [
    h("section",{class:"card"},h("h2",null,"Right now"),
      h("p",{class:"muted"},"One step at a time. It passes."),
      checks(steps,function(x,i){ return !!ui.ticks[i]; },function(x,i,on){ ui.ticks[i]=on; },"st-"),
      why()?h("p",{class:"quote"},why()):null),
    h("div",{class:"two"},
      h("button",{class:"btn primary",type:"button",onclick:function(){ openForm("pass"); }},"It passed. I held."),
      h("button",{class:"btn",type:"button",onclick:function(){ openForm("off"); }},"I fell."))
  ];
}

/* ---------- Log ---------- */
function viewLog(){
  return [h("section",{class:"card"},h("h2",null,"Log"),
    events.length?events.map(function(e){
      var meta=[e.place,e.device].filter(Boolean).join(" · ");
      return h("div",{class:"entry"},
        h("div",{class:"spread"},h("span",{class:"pill"+(e.type==="off"?" off":"")},e.type==="off"?"Fell":"Held"),h("span",{class:"muted"},(e.at||"").replace("T"," "))),
        meta?h("p",{class:"muted"},meta):null,
        e.states&&e.states.length?h("p",{class:"muted"},e.states.join(", ")):null,
        e.lead?h("p",null,h("b",null,"Why: "),e.lead):null,
        e.detail?h("p",null,h("b",null,e.type==="off"?"How: ":"What helped: "),e.detail):null,
        e.barrier?h("p",null,h("b",null,"Barrier that broke: "),e.barrier):null,
        e.next?h("p",null,h("b",null,"New barrier: "),e.next):null,
        h("div",null,h("button",{class:"btn small ghost"+(ui.del===e.id?" danger":""),type:"button",onclick:async function(){
          if(ui.del!==e.id){ ui.del=e.id; return render(); }
          ui.del=null; removeRec(e); render(); }},ui.del===e.id?"Tap again to delete":"Delete")));
    }):h("p",{class:"muted"},"Nothing logged yet. Each time hawa comes, log it: held or fell, with when, why and how."))];
}

/* ---------- Patterns ---------- */
function count(list,key){ var m={}; list.forEach(function(e){ [].concat(e[key]||[]).forEach(function(v){ if(v) m[v]=(m[v]||0)+1; }); });
  return Object.keys(m).map(function(k){ return [k,m[k]]; }).sort(function(a,b){ return b[1]-a[1]; }).slice(0,5); }
function bars(rows,max){ return rows.map(function(r){ return h("div",{class:"bar"},h("span",null,r[0]),h("span",{class:"num"},r[1]),
  h("div",{class:"track"},h("div",{class:"fill",style:"width:"+(max?Math.round(100*r[1]/max):0)+"%"}))); }); }
function viewPatterns(){
  var t=today(), last30=[], i; for(i=29;i>=0;i--) last30.push(shift(t,-i));
  var answered=last30.filter(function(k){ return days[k]&&typeof days[k].onTrack==="boolean"; });
  var on=answered.filter(function(k){ return days[k].onTrack; }).length;
  var tracked=last30.filter(function(k){ return days[k]&&(typeof days[k].onTrack==="boolean"||Object.keys(days[k].habits||{}).length); });
  var from=shift(t,-29), ev=events.filter(function(e){ return e.date>=from; });
  var falls=ev.filter(function(e){ return e.type==="off"; }), held=ev.length-falls.length;
  var hrows=habits().map(function(x){ return [x.label,tracked.filter(function(d){ return days[d].habits&&days[d].habits[x.id]; }).length]; });
  var buckets=[["Night, 00–06",0],["Morning, 06–12",0],["Afternoon, 12–18",0],["Evening, 18–24",0]];
  ev.forEach(function(e){ buckets[Math.min(3,Math.floor((e.hour||0)/6))][1]++; });
  var bmax=Math.max.apply(null,buckets.map(function(b){ return b[1]; }));
  function top(title,list,key){ var rows=count(list,key); return rows.length?h("section",{class:"card"},h("h3",null,title),bars(rows,rows[0][1])):null; }
  return [
    h("section",{class:"card"},h("h2",null,"Patterns, last 30 days"),
      h("div",{class:"figs"},
        h("div",{class:"fig"},h("b",null,on+" of "+answered.length),h("span",null,"answered days on track")),
        h("div",{class:"fig"},h("b",null,held),h("span",null,"held")),
        h("div",{class:"fig"},h("b",null,falls.length),h("span",null,"fell"))),
      h("p",{class:"muted"},"No streak. What counts is the habits you keep, the barriers you fix and how fast you come back.")),
    h("section",{class:"card"},h("h3",null,"Habits kept, of "+tracked.length+" tracked days"),
      tracked.length?bars(hrows,tracked.length):h("p",{class:"muted"},"Tick your habits on the first page and this fills in.")),
    ev.length?h("section",{class:"card"},h("h3",null,"When hawa comes"),bars(buckets,bmax)):null,
    top("Barrier that broke",falls,"barrier"), top("How I felt just before",ev,"states"), top("Where",ev,"place"), top("In front of me",ev,"device"),
    ev.length?null:h("section",{class:"card"},h("p",{class:"muted"},"After a few log entries this shows when hawa comes, where, in what state, and which barriers break."))
  ];
}

/* ---------- Barriers ---------- */
function viewBarriers(){
  function item(b){ var n=events.filter(function(e){ return e.type==="off"&&e.barrierId===b.id; }).length, key="b:"+b.id;
    var editing=ui.fixEdit===b.id;
    return h("div",{class:"entry"},h("p",null,b.text),n?h("p",{class:"muted"},"Broke "+n+(n===1?" time":" times")):null,
      busyFix[b.id]?h("p",{class:"muted"},"Finding a fix…"):null,
      b.fix&&!editing&&!busyFix[b.id]?h("div",{class:"fix"},h("span",{class:"ref"},"How to fix it"),h("p",null,b.fix)):null,
      editing?h("div",{class:"block"},h("label",{class:"field"},"How to fix it",h("textarea",{id:"fix-text",value:b.fix||"",placeholder:"The concrete steps."})),
        h("div",{class:"row"},
          h("button",{class:"btn small primary",type:"button",onclick:function(){ patchBarrier(b,{fix:document.getElementById("fix-text").value.trim()}); ui.fixEdit=null; render(); }},"Save fix"),
          h("button",{class:"btn small ghost",type:"button",onclick:function(){ ui.fixEdit=null; render(); }},"Cancel"))):null,
      h("div",{class:"row"},
        h("button",{class:"btn small",type:"button",onclick:function(){ setBarrier(b,b.status==="open"?"up":"open"); render(); }},b.status==="open"?"Now in place":"It broke"),
        ai&&!editing?h("button",{class:"btn small ghost",type:"button",disabled:!!busyFix[b.id],onclick:function(){ suggest(b); }},b.fix?"New suggestion":"Suggest a fix"):null,
        editing?null:h("button",{class:"btn small ghost",type:"button",onclick:function(){ ui.fixEdit=b.id; render(); }},b.fix?"Edit fix":"Write fix"),
        h("button",{class:"btn small ghost"+(ui.del===key?" danger":""),type:"button",onclick:async function(){
          if(ui.del!==key){ ui.del=key; return render(); }
          ui.del=null; removeRec(b); render(); }},ui.del===key?"Tap again to delete":"Delete"))); }
  var open=barriers.filter(function(b){ return b.status==="open"; }), up=barriers.filter(function(b){ return b.status!=="open"; });
  return [
    h("section",{class:"card"},h("h2",null,"Barriers"),
      h("p",{class:"muted"},"A barrier is set up in advance, so the fall has no path. When one breaks, fix it the same day."),
      h("label",{class:"field"},"New barrier",h("input",{type:"text",id:"new-barrier",placeholder:"For example: phone stays in the hallway at night"})),
      h("div",null,h("button",{class:"btn primary",type:"button",onclick:function(){ var el=document.getElementById("new-barrier"), text=el.value.trim(); if(!text) return; addBarrier(text).then(function(b){ if(b&&ai) suggest(b); }); render(); }},"Add barrier"))),
    h("section",{class:"card"},h("h3",null,"To set up or fix"),open.length?open.map(item):h("p",{class:"muted"},"Nothing open.")),
    h("section",{class:"card"},h("h3",null,"In place"),up.length?up.map(item):h("p",{class:"muted"},"No barriers in place yet."))
  ];
}

/* ---------- Edit ---------- */
function viewEditBase(){
  var steps=plan(), list=habits();
  var habitEditor=ui.editHabits?h("div",{class:"block"},
    list.map(function(x){ return h("div",{class:"spread"},h("span",{style:"min-width:0;overflow-wrap:anywhere"},x.label+" · "+x.group),
      h("button",{class:"btn small ghost",type:"button","aria-label":"Remove "+x.label,onclick:function(){ putSettings({habits:list.filter(function(y){ return y.id!==x.id; })}); render(); }},"Remove")); }),
    h("label",{class:"field"},"New habit",h("input",{type:"text",id:"new-habit",placeholder:"For example: no phone before Fajr"})),
    h("label",{class:"field"},"Group",h("select",{id:"new-group"},GROUPS.map(function(g){ return h("option",{value:g},g); }))),
    h("div",{class:"row"},
      h("button",{class:"btn primary",type:"button",onclick:function(){ var el=document.getElementById("new-habit"), label=el.value.trim(); if(!label) return;
        putSettings({habits:list.concat([{id:"h"+Date.now().toString(36),label:label,group:document.getElementById("new-group").value}])}); render(); }},"Add habit"),
      h("button",{class:"btn ghost",type:"button",onclick:function(){ ui.editHabits=false; render(); }},"Done"))):
    h("div",null,h("button",{class:"btn",type:"button",onclick:function(){ ui.editHabits=true; render(); }},"Edit habits"));
  var planEditor=ui.editPlan?h("div",{class:"block"},
    h("label",{class:"field"},"One step per line",h("textarea",{id:"plan-text",value:steps.join("\n")})),
    h("div",{class:"row"},
      h("button",{class:"btn primary",type:"button",onclick:function(){ var lines=document.getElementById("plan-text").value.split("\n").map(function(s){ return s.trim(); }).filter(Boolean);
        putSettings({plan:lines.length?lines:DEFAULT_PLAN}); ui.editPlan=false; render(); }},"Save steps"),
      h("button",{class:"btn ghost",type:"button",onclick:function(){ ui.editPlan=false; render(); }},"Cancel"))):
    h("div",{class:"block"},h("p",null,steps.join(" ")),h("div",null,h("button",{class:"btn",type:"button",onclick:function(){ ui.editPlan=true; render(); }},"Edit steps")));
  return [
    h("section",{class:"card"},h("h3",null,"Steps for right now"),planEditor),
    h("section",{class:"card"},h("h3",null,"Why I am doing this"),
      h("textarea",{id:"why","aria-label":"Why I am doing this",value:why(),placeholder:"Write it for the moment you need to read it.",
        oninput:function(ev){ var v=ev.target.value; later("why",function(){ putSettings({why:v}); }); }})),
    h("section",{class:"card"},h("h3",null,"Taqwa habits"),habitEditor)
  ];
}

/* ---------- storage, lock and sync (own app) ---------- */
var locked=true;
var S={v:1,settings:null,days:{},events:[],barriers:[]};
var dev=null, dataKey=null, shas={}, syncing=false, syncAgain=false, syncT=null, hiddenAt=0, syncMsg="";
var LS_DEV="tt.device", LS_STATE="tt.state", LS_STATUS="tt.status", noCode=false, OPEN="no-code";
var tenc=new TextEncoder(), tdec=new TextDecoder(), gate=document.getElementById("gate");

function b64(buf){ var b=new Uint8Array(buf), s="", i; for(i=0;i<b.length;i+=0x8000) s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000)); return btoa(s); }
function unb64(str){ var s=atob(String(str).replace(/\s/g,"")), b=new Uint8Array(s.length), i; for(i=0;i<s.length;i++) b[i]=s.charCodeAt(i); return b; }
async function deriveKey(secret,salt){ var k=await crypto.subtle.importKey("raw",tenc.encode(secret),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:tenc.encode(salt),iterations:210000,hash:"SHA-256"},k,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]); }
async function seal(key,obj){ var iv=crypto.getRandomValues(new Uint8Array(12));
  var ct=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},key,tenc.encode(JSON.stringify(obj))); return {v:1,iv:b64(iv),ct:b64(ct)}; }
async function unseal(key,box){ var pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(box.iv)},key,unb64(box.ct)); return JSON.parse(tdec.decode(pt)); }
function dataSalt(d){ return "tt-data:"+String(d.repo||"local").toLowerCase(); }
function newId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function touch(o){ o.updatedAt=new Date().toISOString(); return o; }
function norm(s){ s=s||{}; return {v:1,settings:s.settings||null,days:s.days||{},events:Array.isArray(s.events)?s.events:[],barriers:Array.isArray(s.barriers)?s.barriers:[]}; }
function derive(){ settings=S.settings; days=S.days;
  events=S.events.filter(function(e){ return !e.deleted; }).sort(function(a,b){ return (a.at||"")<(b.at||"")?1:-1; });
  barriers=S.barriers.filter(function(b){ return !b.deleted; }).sort(function(a,b){ return (a.createdAt||"")<(b.createdAt||"")?-1:1; }); }

var saveBusy=false, saveNext=false;
async function saveLocal(){ if(!dataKey) return; if(saveBusy){ saveNext=true; return; } saveBusy=true;
  try{ do{ saveNext=false; localStorage.setItem(LS_STATE,JSON.stringify(await seal(dataKey,S))); }while(saveNext); }
  catch(e){ setStatus("Could not save on this device."); }
  saveBusy=false; }
function changed(){ derive(); saveLocal(); if(dev&&dev.mode==="github"){ clearTimeout(syncT); syncT=setTimeout(sync,4000); } }
function syncNote(m){ syncMsg=m; setStatus(m); var el=document.getElementById("sync-msg"); if(el) el.textContent=m; }
function flash(t){ setStatus(t); clearTimeout(flashT); flashT=setTimeout(function(){ setStatus(syncMsg); },1500); }

function putDay(d){ touch(d); S.days[d.date]=d; changed(); flash("Saved"); }
function putDaySoon(d){ touch(d); S.days[d.date]=d; changed(); }
function putSettings(patch){ S.settings=touch(Object.assign({},S.settings||{},{habits:habits(),plan:plan(),why:why()},patch)); changed(); flash("Saved"); }
function addBarrier(text){ var b=touch({id:newId(),text:text,status:"open",createdAt:new Date().toISOString()}); S.barriers.push(b); changed(); flash("Saved"); return Promise.resolve(b); }
function patchBarrier(b,patch){ Object.assign(b,patch); touch(b); changed(); }
function addEvent(doc){ S.events.push(touch(Object.assign({id:newId()},doc))); changed(); flash("Saved"); }
function removeRec(o){ o.deleted=true; touch(o); changed(); }

/* merge: the newest version of each day, entry, barrier and the settings wins */
function newer(a,b){ if(!a) return b; if(!b) return a; return (b.updatedAt||"")>(a.updatedAt||"")?b:a; }
function mergeList(a,b){ var m={}; a.concat(b).forEach(function(x){ if(x&&x.id) m[x.id]=newer(m[x.id],x); }); return Object.keys(m).map(function(k){ return m[k]; }); }
function merge(a,b){ var d={}, k; for(k in a.days) d[k]=a.days[k]; for(k in b.days) d[k]=newer(d[k],b.days[k]);
  return {v:1,settings:newer(a.settings,b.settings),days:d,events:mergeList(a.events,b.events),barriers:mergeList(a.barriers,b.barriers)}; }
function sig(s){ return JSON.stringify([s.settings&&s.settings.updatedAt,Object.keys(s.days).sort().map(function(k){ return k+s.days[k].updatedAt; }),
  s.events.map(function(e){ return e.id+e.updatedAt; }).sort(),s.barriers.map(function(b){ return b.id+b.updatedAt; }).sort()]); }

/* GitHub: one encrypted file and one small open status file in a private repository */
function ghFetch(d,method,path,body,raw){ return fetch("https://api.github.com/repos/"+d.repo+(path?"/contents/"+path:""),{method:method,cache:"no-store",
  headers:{Authorization:"Bearer "+d.token,Accept:raw?"application/vnd.github.raw+json":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},
  body:body?JSON.stringify(body):undefined}); }
function ghErr(r){ return {code:(r.status===401||r.status===403)?"auth":"net"}; }
async function ghGet(d,path){ var r=await ghFetch(d,"GET",path); if(r.status===404){ delete shas[path]; return null; } if(!r.ok) throw ghErr(r);
  var j=await r.json(); shas[path]=j.sha; if(j.content) return tdec.decode(unb64(j.content));
  var r2=await ghFetch(d,"GET",path,null,true); if(!r2.ok) throw ghErr(r2); return await r2.text(); }
async function ghPut(d,path,text){ var r=await ghFetch(d,"PUT",path,{message:"sync",content:b64(tenc.encode(text)),sha:shas[path]});
  if(r.status===409||r.status===422) throw {code:"conflict"}; if(!r.ok) throw ghErr(r); var j=await r.json(); shas[path]=j.content.sha; }
async function readRemote(d,key){ var text=await ghGet(d,"data.enc"); if(!text) return null;
  try{ return norm(await unseal(key,JSON.parse(text))); }catch(e){ throw {code:"key"}; } }
function todayStatus(){ var d=S.days[today()]; return JSON.stringify({date:today(),answered:!!(d&&typeof d.onTrack==="boolean")}); }
async function sync(){
  if(locked||!dev||dev.mode!=="github"||!dataKey) return; if(syncing){ syncAgain=true; return; }
  syncing=true; clearTimeout(syncT); syncNote("Syncing…");
  try{ var tries=0;
    for(;;){ try{ var remote=await readRemote(dev,dataKey);
        if(remote){ var before=sig(S); S=merge(S,remote); if(sig(S)!==before){ derive(); saveLocal(); soft(); } }
        if(!remote||sig(S)!==sig(remote)) await ghPut(dev,"data.enc",JSON.stringify(await seal(dataKey,S)));
        break;
      }catch(e){ if(e&&e.code==="conflict"&&tries++<2) continue; throw e; } }
    var st=todayStatus();
    if(localStorage.getItem(LS_STATUS)!==st){ try{ await ghGet(dev,"status.json"); await ghPut(dev,"status.json",st); localStorage.setItem(LS_STATUS,st); }catch(e){ if(!(e&&e.code==="conflict")) throw e; } }
    syncNote("Synced "+new Date().toTimeString().slice(0,5));
  }catch(e){ var c=e&&e.code; syncNote(c==="auth"?"The access key was refused.":c==="key"?"The passphrase does not match the saved data.":"Offline. Saved on this device."); }
  syncing=false; if(syncAgain){ syncAgain=false; sync(); }
}

/* ---------- gate: first setup and the code screen ---------- */
function val(id){ var el=document.getElementById(id); return el?el.value.trim():""; }
function inputField(label,id,type,ph,extra){ return h("label",{class:"field"},label,
  h("input",Object.assign({type:type,id:id,placeholder:ph||"",autocomplete:"off",autocapitalize:"off",autocorrect:"off",spellcheck:"false"},extra||{}))); }
function gateMsg(t,id){ var m=document.getElementById(id||"gate-msg"); if(m) m.textContent=t||""; }
function showGate(nodes){ gate.replaceChildren.apply(gate,nodes); gate.hidden=false; appEl.hidden=true; fab.hidden=true; meter.hidden=true; }
function cleanRepo(v){ return v.replace(/^https?:\/\/github\.com\//,"").replace(/\.git$/,"").replace(/\/+$/,""); }
function checkGh(d){ if(!/^[\w.-]+\/[\w.-]+$/.test(d.repo)) return "Write the repository as owner/name.";
  if(!d.token) return "Paste the access key."; if(d.secret.length<8) return "Choose a passphrase with at least 8 characters."; return ""; }
async function storeDevice(pin){ var salt=b64(crypto.getRandomValues(new Uint8Array(16)));
  noCode=!pin; localStorage.setItem(LS_DEV,JSON.stringify({salt:salt,open:noCode,box:await seal(await deriveKey(pin||OPEN,salt),dev)})); }
async function openDevice(pin){ var rec=JSON.parse(localStorage.getItem(LS_DEV)); return unseal(await deriveKey(pin||OPEN,rec.salt),rec.box); }
function enter(){ locked=false; derive(); gate.hidden=true; gate.replaceChildren(); appEl.hidden=false; ui.view="home"; ui.date=null; syncMsg=""; setStatus(""); render(); window.scrollTo(0,0); sync(); }
function lock(){ locked=true; dev=null; dataKey=null; shas={}; clearTimeout(syncT); S=norm(); derive(); view.replaceChildren(); showLock(); }

function showSetup(){ var mode=ui.setupMode||"github";
  showGate([h("div",{class:"gatebox"},h("h1",null,"Taqwa Track"),
    h("div",{class:"chips"},[["github","Sync with GitHub"],["local","This device only"]].map(function(x){
      return h("button",{class:"chip",type:"button","aria-pressed":String(mode===x[0]),onclick:function(){ ui.setupMode=x[0]; showSetup(); }},x[1]); })),
    mode==="github"?[inputField("Repository","su-repo","text","owner/name",{value:"simonwallgren/tt-data"}),inputField("Access key","su-token","password","Key for that repository only"),
        inputField("Passphrase","su-pass","password","The same on every device")]
      :h("p",{class:"muted"},"Everything stays on this device. You can connect GitHub later under Edit."),
    inputField("Code for this device (optional)","su-pin","password","Leave empty for no code",{inputmode:"numeric"}),
    h("p",{class:"muted",id:"gate-msg",role:"status"}),
    h("button",{class:"btn primary",type:"button",onclick:doSetup},"Start"))]); }
async function doSetup(){ var mode=ui.setupMode||"github", pin=val("su-pin"), d={mode:mode}, state=norm();
  if(mode==="github"){ d.repo=cleanRepo(val("su-repo")); d.token=val("su-token"); d.secret=val("su-pass"); var bad=checkGh(d); if(bad) return gateMsg(bad); }
  else d.secret=b64(crypto.getRandomValues(new Uint8Array(24)));
  if(pin&&pin.length<4) return gateMsg("A code needs at least 4 digits. Leave it empty for no code.");
  gateMsg("Checking…");
  try{ var key=await deriveKey(d.secret,dataSalt(d));
    if(mode==="github"){ var r=await ghFetch(d,"GET",""); if(!r.ok) return gateMsg(r.status===401?"The access key was refused.":"That key cannot reach the repository.");
      var remote=await readRemote(d,key); if(remote) state=remote; }
    dev=d; dataKey=key; S=state; await storeDevice(pin); await saveLocal(); enter();
  }catch(e){ gateMsg(e&&e.code==="key"?"The passphrase does not match the data saved in the repository.":e&&e.code==="auth"?"The access key was refused.":"No connection. Try again."); } }

function showLock(){ var sure=false;
  showGate([h("div",{class:"gatebox"},h("h1",null,"Taqwa Track"),
    inputField("Code","lk-pin","password","",{inputmode:"numeric",onkeydown:function(ev){ if(ev.key==="Enter") doUnlock(); }}),
    h("p",{class:"muted",id:"gate-msg",role:"status"}),
    h("button",{class:"btn primary",type:"button",onclick:doUnlock},"Unlock"),
    h("button",{class:"link",type:"button",id:"lk-reset",onclick:function(){ if(!sure){ sure=true; document.getElementById("lk-reset").textContent="Tap again to erase this device. Synced data stays in GitHub."; return; }
      localStorage.removeItem(LS_DEV); localStorage.removeItem(LS_STATE); localStorage.removeItem(LS_STATUS); showSetup(); }},"Forgot the code"))]);
  var el=document.getElementById("lk-pin"); if(el) el.focus(); }
async function openWith(pin){ try{ dev=await openDevice(pin); }catch(e){ dev=null; return false; }
  noCode=!pin;
  try{ dataKey=await deriveKey(dev.secret,dataSalt(dev)); var raw=localStorage.getItem(LS_STATE); S=raw?norm(await unseal(dataKey,JSON.parse(raw))):norm(); }
  catch(e){ S=norm(); }
  enter(); return true; }
async function doUnlock(){ var pin=val("lk-pin"); if(!pin) return; gateMsg("Opening…"); if(!(await openWith(pin))) gateMsg("Wrong code."); }
function forget(){ localStorage.removeItem(LS_DEV); localStorage.removeItem(LS_STATE); localStorage.removeItem(LS_STATUS);
  locked=true; dev=null; dataKey=null; shas={}; noCode=false; clearTimeout(syncT); S=norm(); derive(); view.replaceChildren(); showSetup(); }

/* ---------- Edit: sync, backup, lock ---------- */
async function doConnect(){ var d={mode:"github",repo:cleanRepo(val("cn-repo")),token:val("cn-token"),secret:val("cn-pass")}, pin=noCode?"":val("cn-pin"), bad=checkGh(d);
  if(bad) return gateMsg(bad,"cn-msg");
  try{ await openDevice(pin); }catch(e){ return gateMsg("Wrong code.","cn-msg"); }
  gateMsg("Checking…","cn-msg");
  try{ var key=await deriveKey(d.secret,dataSalt(d)), r=await ghFetch(d,"GET","");
    if(!r.ok) return gateMsg(r.status===401?"The access key was refused.":"That key cannot reach the repository.","cn-msg");
    var remote=await readRemote(d,key); if(remote) S=merge(S,remote);
    dev=d; dataKey=key; await storeDevice(pin); changed(); render(); sync();
  }catch(e){ gateMsg(e&&e.code==="key"?"The passphrase does not match the data saved in the repository.":"No connection. Try again.","cn-msg"); } }
function exportBackup(){ var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,1)],{type:"application/json"}));
  a.download="taqwa-track-backup-"+today()+".json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(a.href); },5000); }
function importBackup(ev){ var f=ev.target.files&&ev.target.files[0]; if(!f) return;
  f.text().then(function(t){ S=merge(S,norm(JSON.parse(t))); changed(); render(); flash("Backup merged in"); },function(){ setStatus("That file could not be read."); })
   .catch(function(){ setStatus("That file is not a backup."); }); }
function viewEdit(){ var gh=dev&&dev.mode==="github";
  return viewEditBase().concat([
    h("section",{class:"card"},h("h3",null,"Sync"),
      gh?[h("p",{style:"overflow-wrap:anywhere"},dev.repo),h("p",{class:"muted",id:"sync-msg"},syncMsg||"Not synced yet."),
          h("div",null,h("button",{class:"btn",type:"button",onclick:function(){ sync(); }},"Sync now"))]
        :[h("p",{class:"muted"},"This device only. Connect a private GitHub repository to sync with your other devices."),
          inputField("Repository","cn-repo","text","owner/name",{value:"simonwallgren/tt-data"}),inputField("Access key","cn-token","password","Key for that repository only"),
          inputField("Passphrase","cn-pass","password","The same on every device"),noCode?null:inputField("Code for this device","cn-pin","password","Your current code",{inputmode:"numeric"}),
          h("p",{class:"muted",id:"cn-msg",role:"status"}),h("div",null,h("button",{class:"btn primary",type:"button",onclick:doConnect},"Connect"))]),
    h("section",{class:"card"},h("h3",null,"Backup"),h("p",{class:"muted"},"The backup file is not encrypted. Keep it somewhere safe."),
      h("div",{class:"row"},h("button",{class:"btn",type:"button",onclick:exportBackup},"Download backup"),
        h("label",{class:"btn",style:"display:inline-flex;align-items:center;cursor:pointer;box-sizing:border-box"},"Restore from backup",
          h("input",{type:"file",id:"bk-file",accept:"application/json,.json",style:"display:none",onchange:importBackup})))),
    h("section",{class:"card"},h("h3",null,"This device"),h("p",{class:"muted"},noCode?"No code on this device. Anyone who opens the app can read it.":"Opens with your code and locks after two minutes in the background."),
      h("div",{class:"row"},noCode?null:h("button",{class:"btn",type:"button",onclick:lock},"Lock now"),
        h("button",{class:"btn ghost"+(ui.del==="forget"?" danger":""),type:"button",onclick:function(){ if(ui.del!=="forget"){ ui.del="forget"; return render(); } ui.del=null; forget(); }},
          ui.del==="forget"?"Tap again. Synced data stays in GitHub.":"Disconnect this device")))
  ]); }

/* ---------- start ---------- */
document.addEventListener("visibilitychange",function(){
  if(document.hidden){ hiddenAt=Date.now(); if(!locked&&dev&&dev.mode==="github"){ clearTimeout(syncT); sync(); } }
  else if(!locked){ if(!noCode&&Date.now()-hiddenAt>120000) lock(); else sync(); } });
window.addEventListener("online",function(){ sync(); });
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function(){});
if(!window.crypto||!crypto.subtle){ showGate([h("div",{class:"gatebox"},h("h1",null,"Taqwa Track"),h("p",null,"This browser cannot run the app. Open it over https in Safari or Chrome."))]); }
else if(localStorage.getItem(LS_DEV)){ var rec0=null; try{ rec0=JSON.parse(localStorage.getItem(LS_DEV)); }catch(e){}
  if(rec0&&rec0.open){ showGate([h("div",{class:"gatebox"},h("h1",null,"Taqwa Track"),h("p",{class:"muted"},"Opening…"))]); openWith("").then(function(ok){ if(!ok) showSetup(); }); }
  else if(rec0) showLock(); else showSetup(); }
else showSetup();
})();
