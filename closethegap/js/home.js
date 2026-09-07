/* ============================================================
   HOME.JS
   Tab "Oggi": KPI CTL/ATL/TSB, mini-PMC, riepilogo settimana,
   scheda allenamento del giorno, week strip.
   ============================================================ */

function renderHome() {
  var pmc=computePMC();
  document.getElementById('k-ctl').textContent=pmc.ctl||'—';
  document.getElementById('k-atl').textContent=pmc.atl||'—';
  var te=document.getElementById('k-tsb');
  te.textContent=pmc.tsb||'—';
  te.className='kv '+(pmc.tsb>5?'kv-up':pmc.tsb<-10?'kv-dn':'kv-wa');
  document.getElementById('k-ftp').textContent=FTP+'W';
  var ws=weekStats(0), wp=weekPlanned(0);
  renderWeekProgress(ws, wp);
  var h=pmc.history.slice(-183); // ~6 mesi, non piu' 60 giorni
  mkChart('ch-mini-pmc','line',{labels:h.map(function(d){return d.date.slice(5);}),datasets:[
    {label:'CTL',data:h.map(function(d){return d.ctl;}),borderColor:'#3b82f6',tension:.4,pointRadius:0,fill:false,borderWidth:1.5},
    {label:'ATL',data:h.map(function(d){return d.atl;}),borderColor:'#ff4d4d',tension:.4,pointRadius:0,fill:false,borderWidth:1.5},
    {label:'TSB',data:h.map(function(d){return d.tsb;}),borderColor:'#e8ff47',tension:.4,pointRadius:0,fill:false,borderWidth:1.5}
  ]},{scales:{x:{ticks:{color:'#5d657c',font:{size:11},maxTicksLimit:12},grid:{display:false}},y:{ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}}});
  var wks=[];
  for (var i=25;i>=0;i--) { // 26 settimane = ~6 mesi
    var s=weekStats(i); var d=new Date(); d.setDate(d.getDate()-i*7);
    var m=new Date(d); m.setDate(d.getDate()-d.getDay()+1);
    wks.push({label:m.toLocaleDateString('it',{day:'2-digit',month:'2-digit'}),tss:Math.round(s.tss),km:Math.round(s.km/1000)});
  }
  /* FIX build precedente: 'borderColor:var(--acc)' era CSS letterale dentro
     al JS -> SyntaxError che bloccava l'intero script. Ora è una stringa. */
  mkChart('ch-home-tss','bar',{labels:wks.map(function(w){return w.label;}),datasets:[
    {label:'TSS',data:wks.map(function(w){return w.tss;}),backgroundColor:'rgba(232,255,71,.5)',borderColor:'#e8ff47',borderWidth:1,borderRadius:3,yAxisID:'y'},
    {label:'Km',data:wks.map(function(w){return w.km;}),type:'line',borderColor:'#3b82f6',pointRadius:2,tension:.3,yAxisID:'y1'}
  ]},{scales:{
    x:{ticks:{color:'#5d657c',font:{size:11},maxTicksLimit:13},grid:{display:false}},
    y:{ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.03)'}},
    y1:{position:'right',ticks:{color:'#5d657c',font:{size:11}},grid:{display:false}}}});
  var rec=[].concat(activities).sort(function(a,b){return b.date.localeCompare(a.date);}).slice(0,5);
  document.getElementById('home-recent').innerHTML=rec.map(function(a){
    return '<div class="rl-item">'+
      '<div class="rl-dot" style="background:'+(a.isRace?'#a78bfa':'#22d46a')+'"></div>'+
      '<div><div class="rl-name">'+(a.isRace?'🏁 ':'')+a.name+'</div>'+
      '<div class="rl-meta"><span>'+a.date.slice(5)+'</span><span>'+fmtDist(a.dist)+'km</span><span>'+fmtDur(a.dur)+'</span></div></div>'+
      '<div class="rl-tss">'+calcTSS(a)+'</div></div>';
  }).join('');
  renderTodayCard(today());
  renderWeekStrip();
}

/* Barra "svolto / pianificato" per la settimana corrente: si vede a
   colpo d'occhio a che punto sei e quanto manca al target. */
function renderWeekProgress(ws, wp) {
  var el=document.getElementById('week-progress');
  if (!el) return;
  var doneTSS=Math.round(ws.tss), planTSS=Math.round(wp.tss);
  var doneH=ws.dur/3600, planH=wp.dur/3600;
  var doneSessions=activities.filter(function(a){
    var now=new Date(), mon=new Date(now); mon.setDate(now.getDate()-now.getDay()+1); mon.setHours(0,0,0,0);
    var sun=new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59);
    var d=new Date(a.date); return d>=mon&&d<=sun;
  }).length;

  function bar(label, done, plan, unit, decimals) {
    var pct = plan>0 ? Math.min(100, Math.round(done/plan*100)) : 0;
    var over = plan>0 && done>plan;
    var col = over ? 'var(--grn)' : pct>=80 ? 'var(--grn)' : pct>=45 ? 'var(--acc)' : 'var(--blu)';
    var d = decimals ? (Math.round(done*10)/10).toFixed(1) : Math.round(done);
    var p = decimals ? (Math.round(plan*10)/10).toFixed(1) : Math.round(plan);
    var remaining = plan-done;
    var remTxt = plan<=0 ? '' : remaining>0
      ? ('mancano ' + (decimals ? (Math.round(remaining*10)/10).toFixed(1) : Math.round(remaining)) + unit)
      : 'target raggiunto ✅';
    return '<div style="margin-bottom:11px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">'+
        '<span style="font-size:.66rem;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;">'+label+'</span>'+
        '<span style="font-size:.92rem;font-weight:700;">'+d+'<span style="color:var(--tx3);font-weight:500;"> / '+p+unit+'</span></span>'+
      '</div>'+
      '<div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden;">'+
        '<div style="height:100%;width:'+pct+'%;background:'+col+';border-radius:3px;transition:width .3s;"></div>'+
      '</div>'+
      '<div style="font-size:.58rem;color:var(--tx3);margin-top:3px;">'+remTxt+'</div>'+
    '</div>';
  }

  var html = bar('TSS', doneTSS, planTSS, '', false) +
             bar('Ore', doneH, planH, 'h', true) +
             '<div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid var(--br);font-size:.66rem;color:var(--tx2);">'+
               '<span>Uscite: <strong>'+doneSessions+'</strong> / '+wp.sessions+'</span>'+
               '<span>Km: <strong>'+Math.round(ws.km/1000)+'</strong></span>'+
             '</div>';
  el.innerHTML=html;
}

function renderTodayCard(ds) {
  var session=plan.find(function(p){return p.date===ds;});
  var td=today();
  document.getElementById('today-label').textContent=ds===td?'Allenamento di Oggi':'Allenamento del '+ds.slice(5).replace('-','/');
  var content=document.getElementById('today-content');
  if (!session) { content.innerHTML='<div class="empty">Nessun allenamento pianificato.</div>'; return; }
  var done=activities.find(function(a){return a.date===ds;});
  var bc=ZBADGE[session.type]||'bz2';
  var html='<div style="margin-bottom:8px;"><span class="today-badge '+bc+'">'+session.type.toUpperCase()+'</span>'+(done?'<span class="today-badge bgrn">✅ Svolto</span>':'')+'</div>';
  html+='<div class="today-name">'+session.name+'</div>';
  html+='<div class="today-meta">';
  if (session.durMin) html+='<div class="tm-item"><div class="tm-val">'+session.durMin+'<span style="font-size:.62rem;color:var(--tx3)"> min</span></div><div class="tm-lbl">Durata</div></div>';
  html+='<div class="tm-item"><div class="tm-val">'+session.tss+'<span style="font-size:.62rem;color:var(--tx3)"> TSS</span></div><div class="tm-lbl">Target</div></div>';
  html+='</div>';
  if (session.desc) html+='<div class="today-desc">'+session.desc+'</div>';
  if (session.blocks&&session.blocks.length&&session.type!=='off') html+=renderWorkoutBlock(session);
  if (session.adaptNote) html+='<div class="adapt-note">⚡ '+session.adaptNote+'</div>';
  content.innerHTML=html;
}

function renderWorkoutBlock(session) {
  var blocks=session.blocks;
  var total=blocks.reduce(function(s,b){return s+b.d;},0)||session.durMin||60;
  var html='<div class="wc-wrap"><div class="wc-lbl">Struttura Allenamento</div><div class="wc-chart">';
  blocks.forEach(function(b){
    var wp=Math.max((b.d/total)*100,0.5);
    var hp=Math.min(Math.round((b.lo+b.hi)/2/150*100),100);
    var watt=Math.round((b.lo+b.hi)/2*FTP/100);
    var tip=b.l+' · '+watt+'W · '+b.lo+'-'+b.hi+'% FTP · '+(b.d<1?'~30s':Math.round(b.d)+'min');
    html+='<div class="wc-block" style="width:'+wp+'%;height:'+hp+'%;background:'+zc(b.z)+';opacity:.85;"><div class="wc-tip">'+tip+'</div></div>';
  });
  html+='</div>';
  var zones={};
  blocks.forEach(function(b){if(b.z>0) zones[b.z]=(zones[b.z]||0)+b.d;});
  html+='<div class="wc-zones">';
  Object.keys(zones).forEach(function(z){
    html+='<span class="wc-ztag" style="background:'+zc(parseInt(z))+'22;color:'+zc(parseInt(z))+';border:1px solid '+zc(parseInt(z))+'44;">Z'+z+' '+Math.round(zones[z])+'min</span>';
  });
  return html+'</div></div>';
}

function renderWeekStrip() {
  var now=new Date(), mon=new Date(now);
  mon.setDate(now.getDate()-now.getDay()+1); mon.setHours(0,0,0,0);
  var dows=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  var td=today(), html='';
  for (var i=0;i<7;i++) {
    var d=new Date(mon); d.setDate(mon.getDate()+i);
    var ds=dateKey(d);
    var s=plan.find(function(p){return p.date===ds;});
    var done=activities.find(function(a){return a.date===ds;});
    var isT=ds===td;
    var cls='ws-day'+(isT?' ws-today':'')+(done?' ws-done':'')+(s&&s.type==='off'?' ws-off':'');
    var dotCol=s?zc(parseInt((s.type||'1').replace('z',''))||1):'#2a2f48';
    if (s&&s.type==='race') dotCol='#a78bfa';
    html+='<div class="'+cls+'" onclick="selectDay(\''+ds+'\')">';
    html+='<div class="ws-dow">'+dows[i]+'</div>';
    html+='<div class="ws-date">'+d.getDate()+'</div>';
    html+='<div class="ws-dot" style="background:'+dotCol+';"></div>';
    html+='<div class="ws-tss">'+(s&&s.tss>0?s.tss+'tss':'—')+'</div>';
    if (done) html+='<div class="ws-done-ico">✅</div>';
    html+='</div>';
  }
  document.getElementById('week-strip').innerHTML=html;
}

function selectDay(ds) { renderTodayCard(ds); }
