/* ============================================================
   CALENDAR.JS
   Tab Calendario: griglia mensile con pillole attività/piano.
   ============================================================ */

function renderCal() {
  var showPlan=document.getElementById('tog-plan').checked;
  var y=calDate.getFullYear(), m=calDate.getMonth();
  document.getElementById('cal-label').textContent=calDate.toLocaleDateString('it',{month:'long',year:'numeric'}).replace(/^\w/,function(c){return c.toUpperCase();});
  document.getElementById('cal-dow').innerHTML=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(function(d){return '<div style="text-align:center;font-size:.6rem;color:var(--tx3);padding:3px;text-transform:uppercase;">'+d+'</div>';}).join('');
  var first=new Date(y,m,1); var sd=first.getDay(); if(sd===0)sd=7;
  var last=new Date(y,m+1,0).getDate(); var cells=[];
  for(var i=1;i<sd;i++) cells.push({date:new Date(y,m,1-sd+i),cur:false});
  for(var d2=1;d2<=last;d2++) cells.push({date:new Date(y,m,d2),cur:true});
  while(cells.length%7){var l=cells[cells.length-1].date;var nd=new Date(l);nd.setDate(l.getDate()+1);cells.push({date:nd,cur:false});}
  var td=today();
  document.getElementById('cal-grid').innerHTML=cells.map(function(c){
    var ds=dateKey(c.date);
    var da=activities.filter(function(a){return a.date===ds;});
    var pi=showPlan?plan.filter(function(p){return p.date===ds&&p.type!=='off';}):[];
    var isT=ds===td;
    var bdr=isT?'border-color:var(--acc);':'';
    var op=c.cur?'':'opacity:.22;';
    var html='<div class="cal-day-cell" style="'+bdr+op+'">';
    html+='<div style="font-size:.66rem;color:var(--tx3);margin-bottom:2px;font-weight:600;">'+c.date.getDate()+'</div>';
    da.forEach(function(a){
      html+='<span class="cal-pill" style="background:'+(a.isRace?'rgba(167,139,250,.2)':'rgba(34,212,106,.15)')+';color:'+(a.isRace?'#a78bfa':'#22d46a')+'">'+(a.isRace?'🏁 ':'')+a.name.substring(0,12)+'</span>';
      html+='<span class="cal-sub">'+fmtDur(a.dur)+' · '+fmtDist(a.dist)+'km · '+calcTSS(a)+'TSS'+(calcNP(a)?' · '+calcNP(a)+'W':'')+'</span>';
    });
    pi.forEach(function(p){
      html+='<span class="cal-pill" style="background:rgba(59,130,246,.15);color:#3b82f6;">📋 '+p.name.substring(0,12)+'</span>';
      html+='<span class="cal-sub">'+p.durMin+'min · '+p.tss+' TSS</span>';
    });
    return html+'</div>';
  }).join('');
}
function calPrev(){calDate.setMonth(calDate.getMonth()-1);renderCal();}
function calNext(){calDate.setMonth(calDate.getMonth()+1);renderCal();}
function calToday(){calDate=new Date();renderCal();}
