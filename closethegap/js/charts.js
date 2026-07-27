/* ============================================================
   CHARTS.JS
   Wrapper Chart.js + tutti i render per la tab Analisi & Power.
   Dipende da config.js, metrics.js, models.js.
   ============================================================ */

function mkChart(id,type,data,extra) {
  if (charts[id]) charts[id].destroy();
  var ctx=document.getElementById(id); if(!ctx) return;
  var opts={responsive:true,maintainAspectRatio:false,
    plugins:{legend:{labels:{color:'#8b92a8',font:{size:9},boxWidth:10}}},
    scales:type==='doughnut'||type==='pie'?{}:{
      x:{ticks:{color:'#4a5168',font:{size:8}},grid:{color:'rgba(255,255,255,.03)'}},
      y:{ticks:{color:'#4a5168',font:{size:8}},grid:{color:'rgba(255,255,255,.04)'}}
    }
  };
  if (extra) Object.assign(opts, extra);
  charts[id]=new Chart(ctx,{type:type,data:data,options:opts});
}

function recalcAll() {
  FTP=parseInt(document.getElementById('ftp-inp').value)||340;
  LTHR=parseInt(document.getElementById('lthr-inp').value)||180;
  HR_MAX=parseInt(document.getElementById('hrmax-inp').value)||197;
  var hrRestEl=document.getElementById('hrrest-inp');
  if (hrRestEl) HR_REST=parseInt(hrRestEl.value)||48;
  document.getElementById('k-ftp').textContent=FTP+'W';
  document.getElementById('pz-label').textContent=FTP+'W';
  document.getElementById('lthr-label').textContent=LTHR;
  renderAnalytics();
}

function renderAnalytics() {
  var pmc=computePMC();
  var h=pmc.history.slice(-120);
  mkChart('ch-pmc','line',{labels:h.map(function(d){return d.date.slice(5);}),datasets:[
    {label:'CTL',data:h.map(function(d){return d.ctl;}),borderColor:'#3b82f6',tension:.4,pointRadius:0,fill:false,borderWidth:1.5},
    {label:'ATL',data:h.map(function(d){return d.atl;}),borderColor:'#ff4d4d',tension:.4,pointRadius:0,fill:false,borderWidth:1.5},
    {label:'TSB',data:h.map(function(d){return d.tsb;}),borderColor:'#e8ff47',tension:.4,pointRadius:0,fill:false,borderWidth:1.5}
  ]});
  var mm={},hm={};
  activities.forEach(function(a){var m=a.date.slice(0,7);mm[m]=(mm[m]||0)+a.dist;hm[m]=(hm[m]||0)+a.dur;});
  var mk=Object.keys(mm).sort();
  mkChart('ch-km','bar',{labels:mk,datasets:[{label:'Km',data:mk.map(function(k){return Math.round(mm[k]/1000);}),backgroundColor:'rgba(34,212,106,.4)',borderColor:'#22d46a',borderWidth:1,borderRadius:3}]});
  mkChart('ch-hours','bar',{labels:mk,datasets:[{label:'Ore',data:mk.map(function(k){return parseFloat((hm[k]/3600).toFixed(1));}),backgroundColor:'rgba(59,130,246,.4)',borderColor:'#3b82f6',borderWidth:1,borderRadius:3}]});
  var showBE=['1min','5min','20min','1h'];
  document.getElementById('power-kpis').innerHTML=
    bestEfforts.filter(function(e){return showBE.indexOf(e.label)>=0;}).map(function(e){
      return '<div class="pk"><div class="pkv">'+e.watts+'W</div><div class="pkl">'+e.label+' · '+Math.round(e.watts/FTP*100)+'%</div></div>';
    }).join('')+
    '<div class="pk"><div class="pkv" style="color:var(--acc);">'+FTP+'W</div><div class="pkl">FTP</div></div>'+
    '<div class="pk"><div class="pkv">'+parseFloat((FTP/WEIGHT_KG).toFixed(1))+'</div><div class="pkl">W/kg</div></div>';
  mkChart('ch-pc','line',{labels:bestEfforts.map(function(e){return e.label;}),datasets:[
    {label:'Best Power',data:bestEfforts.map(function(e){return e.watts;}),borderColor:'#e8ff47',backgroundColor:'rgba(232,255,71,.07)',tension:.4,pointRadius:3,pointBackgroundColor:'#e8ff47',fill:true,borderWidth:1.5},
    {label:'FTP',data:bestEfforts.map(function(){return FTP;}),borderColor:'rgba(59,130,246,.4)',borderDash:[4,4],pointRadius:0,fill:false,borderWidth:1}
  ]});
  document.getElementById('pz-label').textContent=FTP+'W';
  var zoneColors={1:'#4a5168',2:'#22d46a',3:'#fbbf24',4:'#f97316',5:'#ff4d4d',6:'#a78bfa',7:'#ec4899'};
  var PZ=computePowerZones().map(function(z){return {n:z.label,lo:z.lo,hi:z.hi,c:zoneColors[z.z]};});
  document.getElementById('power-zones').innerHTML=PZ.map(function(z){
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--br);">'+
      '<div style="width:8px;height:8px;border-radius:50%;background:'+z.c+';flex-shrink:0;"></div>'+
      '<div style="font-size:.7rem;flex:1;color:var(--tx2);">'+z.n+'</div>'+
      '<div style="font-size:.7rem;font-weight:600;">'+z.lo+'–'+z.hi+'W</div></div>';
  }).join('');
  var ww=[].concat(activities).filter(function(a){return a.avg_watts;}).sort(function(a,b){return a.date.localeCompare(b.date);}).slice(-20);
  mkChart('ch-watts','bar',{labels:ww.map(function(a){return a.date.slice(5);}),datasets:[
    {label:'W medi',data:ww.map(function(a){return a.avg_watts;}),backgroundColor:'rgba(232,255,71,.5)',borderColor:'#e8ff47',borderWidth:1,borderRadius:3},
    {label:'FTP',data:ww.map(function(){return FTP;}),type:'line',borderColor:'rgba(59,130,246,.4)',borderDash:[4,4],pointRadius:0,borderWidth:1}
  ]});
  try { renderHeatmap(); } catch(e) { console.warn('heatmap:',e.message); }
  try { renderZoneDist(); } catch(e) { console.warn('zonedist:',e.message); }
  try { renderScatter(); } catch(e) { console.warn('scatter:',e.message); }
  try { renderCPModel(); } catch(e) { console.warn('cpmodel:',e.message); }
  try { renderPDM(); } catch(e) { console.warn('pdm:',e.message); }
  try { renderEF(); } catch(e) { console.warn('ef:',e.message); }
  try { renderVI(); } catch(e) { console.warn('vi:',e.message); }
  try { renderWbal(); } catch(e) { console.warn('wbal:',e.message); }
  try { renderBanister(); } catch(e) { console.warn('banister:',e.message); }
  try { renderDecouple(); } catch(e) { console.warn('decouple:',e.message); }
}

function renderHeatmap() {
  var end=new Date(), start=new Date(end); start.setFullYear(end.getFullYear()-1);
  var cur=new Date(start); while(cur.getDay()!==1) cur.setDate(cur.getDate()-1);
  var tssMap={};
  activities.forEach(function(a){tssMap[a.date]=(tssMap[a.date]||0)+calcTSS(a);});
  var cols=[], col=[], mCols=[], lastM=-1, ci=0;
  while(cur<=end){
    var ds=dateKey(cur); var tss=tssMap[ds]||0;
    var lvl=tss===0?0:tss<50?1:tss<100?2:tss<150?3:4;
    col.push({ds:ds,lvl:lvl,tss:tss});
    var mo=cur.getMonth();
    if(mo!==lastM){mCols.push({idx:ci,label:cur.toLocaleDateString('it',{month:'short'})});lastM=mo;}
    cur.setDate(cur.getDate()+1);
    if(cur.getDay()===1){cols.push(col);col=[];ci++;}
  }
  if(col.length) cols.push(col);
  var HC=['var(--s3)','rgba(232,255,71,.15)','rgba(232,255,71,.35)','rgba(232,255,71,.6)','var(--acc)'];
  var html='<div style="display:flex;gap:2px;">';
  cols.forEach(function(column,cIdx){
    var ml=mCols.find(function(m){return m.idx===cIdx;});
    html+='<div style="display:flex;flex-direction:column;gap:2px;min-width:11px;">';
    html+='<div style="font-size:.5rem;color:var(--tx3);height:10px;white-space:nowrap;">'+(ml?ml.label:'')+'</div>';
    for(var day=0;day<7;day++){
      if(column[day]) html+='<div style="width:11px;height:11px;border-radius:2px;background:'+HC[column[day].lvl]+'" title="'+column[day].ds+': '+column[day].tss+' TSS"></div>';
      else html+='<div style="width:11px;height:11px;"></div>';
    }
    html+='</div>';
  });
  document.getElementById('hm-wrap').innerHTML=html+'</div>';
}

function renderZoneDist() {
  var pzZones = computePowerZones();
  var pzB = pzZones.map(function(z){return z.lo;}).concat([pzZones[pzZones.length-1].hi]);
  var pzL=['Z1','Z2','Z3','Z4','Z5','Z6','Z7'];
  var pzC=['#4a5168','#22d46a','#fbbf24','#f97316','#ff4d4d','#a78bfa','#ec4899'];
  var pzS=new Array(7).fill(0);
  activities.filter(function(a){return a.avg_watts;}).forEach(function(a){
    for(var i=0;i<7;i++){if(a.avg_watts>=pzB[i]&&a.avg_watts<pzB[i+1]){pzS[i]+=a.dur;break;}}
  });
  var pzT=Math.max(pzS.reduce(function(s,v){return s+v;},0),1);
  document.getElementById('zone-dist-power').innerHTML=pzL.map(function(l,i){
    var lo=pzB[i], hi=i===6?'Max':pzB[i+1], pct=Math.round(pzS[i]/pzT*100);
    return '<div class="zbar"><span class="zbar-lbl" style="color:'+pzC[i]+';">'+l+' '+lo+'–'+hi+'W</span><div class="zbar-track"><div class="zbar-fill" style="width:'+pct+'%;background:'+pzC[i]+'"></div></div><span class="zbar-pct">'+pct+'%</span></div>';
  }).join('');
  var hrZones = computeHRZones(LTHR);
  var hrB = hrZones.map(function(z){return z.lo;}).concat([HR_MAX]);
  var hrL=['Z1 Rec','Z2 Aerob','Z3 Tempo','Z4 Soglia','Z5 VO2'];
  var hrC=['#4a5168','#22d46a','#fbbf24','#f97316','#ff4d4d'];
  var hrS=new Array(5).fill(0);
  activities.filter(function(a){return a.hr;}).forEach(function(a){
    for(var i=0;i<5;i++){if(a.hr>=hrB[i]&&a.hr<hrB[i+1]){hrS[i]+=a.dur;break;}}
  });
  var hrT=Math.max(hrS.reduce(function(s,v){return s+v;},0),1);
  document.getElementById('lthr-label').textContent=LTHR;
  var lthrEst = estimateLTHRFromHistory();
  var lthrNoteEl = document.getElementById('lthr-estimate-note');
  if (lthrNoteEl) {
    lthrNoteEl.innerHTML = lthrEst ? ('LTHR stimata dai dati reali: <strong>'+lthrEst.lthr+'bpm</strong> (da "'+lthrEst.source+'", '+lthrEst.date+') — quella in uso ora è '+LTHR+'bpm.') : '';
  }
  document.getElementById('zone-dist-hr').innerHTML=hrL.map(function(l,i){
    var lo=hrB[i], hi=hrB[i+1]===HR_MAX?HR_MAX:hrB[i+1]-1, pct=Math.round(hrS[i]/hrT*100);
    return '<div class="zbar"><span class="zbar-lbl" style="color:'+hrC[i]+';">'+l+' '+lo+'–'+hi+'bpm</span><div class="zbar-track"><div class="zbar-fill" style="width:'+pct+'%;background:'+hrC[i]+'"></div></div><span class="zbar-pct">'+pct+'%</span></div>';
  }).join('');
}

function renderScatter() {
  var pts=activities.filter(function(a){return calcTSS(a)>10;}).map(function(a){
    var IF=calcIF(a)||0.65; return {x:IF,y:calcTSS(a),name:a.name,date:a.date,isRace:a.isRace};
  });
  var colors=pts.map(function(p){
    return p.isRace?'rgba(167,139,250,.85)':p.y>150&&p.x>0.75?'rgba(255,77,77,.75)':p.y>150?'rgba(34,212,106,.75)':p.x>0.75?'rgba(249,115,22,.75)':'rgba(59,130,246,.65)';
  });
  mkChart('ch-scatter','scatter',{datasets:[
    {label:'Attivita',data:pts.map(function(p){return{x:p.x,y:p.y};}),backgroundColor:colors,pointRadius:5,pointHoverRadius:7},
    {label:'IF=0.75',type:'line',data:[{x:0.75,y:0},{x:0.75,y:400}],borderColor:'rgba(255,255,255,.08)',borderDash:[3,3],pointRadius:0},
    {label:'TSS=150',type:'line',data:[{x:0,y:150},{x:1.3,y:150}],borderColor:'rgba(255,255,255,.08)',borderDash:[3,3],pointRadius:0}
  ]},{plugins:{tooltip:{callbacks:{label:function(c){var p=pts[c.dataIndex];return p?p.date+' '+p.name.substring(0,16)+' IF:'+c.parsed.x.toFixed(2)+' TSS:'+c.parsed.y:'';}}}},scales:{x:{min:0.4,max:1.3},y:{min:0}}});
}

function renderCPModel() {
  var cp=cpModel();
  var CP=cp.CP, Wp=cp.Wp;
  document.getElementById('cp-val').textContent=CP+'W'+(cp.native?' ●':'');
  document.getElementById('wp-val').textContent=Math.round(Wp/1000)+'kJ';
  document.getElementById('pmax-val').textContent=(cp.native&&cp.pMax?Math.round(cp.pMax):bestEfforts[0].watts)+'W';
  var srcLabel = cp.native ? "CP="+CP+"W W'="+Math.round(Wp/1000)+"kJ (● modello nativo Morton 3P di Intervals.icu)" : "CP="+CP+"W W'="+Math.round(Wp/1000)+"kJ (fit locale su "+cp.fitPoints+" punti 3-20min)";
  var tP=[5,10,20,30,60,120,180,300,480,600,900,1200,1800,2700,3600];
  mkChart('ch-cp','line',{labels:tP.map(function(t){return t<60?t+'s':t<3600?Math.round(t/60)+'min':'1h';}),datasets:[
    {label:'Best Efforts',data:bestEfforts.map(function(e){return e.watts;}),type:'scatter',backgroundColor:'#e8ff47',pointRadius:5},
    {label:srcLabel,data:tP.map(function(t){return Math.round(CP+Wp/t);}),borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,.07)',tension:.4,pointRadius:0,fill:true,borderWidth:1.5},
    {label:'FTP',data:tP.map(function(){return FTP;}),borderColor:'rgba(232,255,71,.4)',borderDash:[4,4],pointRadius:0,borderWidth:1}
  ]});
}

function renderPDM() {
  var m=pdmModel();
  var gap=360-m.ftpEst;
  var weeksNeeded=gap>0?Math.ceil(gap/1.5):0;
  var daysNeeded=weeksNeeded*7;
  document.getElementById('pdm-ftp').textContent=m.ftpEst+'W';
  document.getElementById('pdm-cp').textContent=m.CP+'W';
  document.getElementById('pdm-eta').textContent=gap>0?daysNeeded+'gg':'Raggiunto';
  document.getElementById('pdm-note').textContent='FTP stimato: '+m.ftpEst+'W (Morton: '+m.ftpMorton+'W · 95% 20min: '+m.ftp20+'W · Pmax neuromuscolare: '+m.Pmax+'W). Gap: '+gap+'W. '+
    (gap>0?'Al ritmo ~1.5W/sett servono '+weeksNeeded+' sett. '+(daysNeeded<=59?'Obiettivo 19 set raggiungibile!':'Accelerare il carico.'):'Obiettivo 360W raggiunto!');
  var tPts=[5,15,30,60,120,180,300,480,600,900,1200,1800,2700,3600,5400,7200];
  var modelW=tPts.map(function(t){return Math.max(pdmCurve(t,m.CP,m.Wp,m.Pmax),0);});
  var projCP=Math.round(m.CP*(360/Math.max(m.ftpEst,1)));
  var projWp=Math.round(m.Wp*1.05);
  var projW=tPts.map(function(t){return Math.max(pdmCurve(t,projCP,projWp,m.Pmax),0);});
  mkChart('ch-pdm','line',{
    labels:tPts.map(function(t){return t<60?t+'s':t<3600?Math.round(t/60)+'min':Math.round(t/3600)+'h';}),
    datasets:[
      {label:'Best Efforts',data:bestEfforts.filter(function(e){return e.secs<=7200;}).map(function(e){return e.watts;}),type:'scatter',backgroundColor:'#e8ff47',pointRadius:6},
      {label:'Modello attuale (FTP est. '+m.ftpEst+'W)',data:modelW,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,.07)',tension:.4,pointRadius:0,fill:true,borderWidth:1.5},
      {label:'Obiettivo 360W FTP',data:projW,borderColor:'rgba(232,255,71,.5)',borderDash:[5,4],pointRadius:0,fill:false,borderWidth:1.5},
      {label:'FTP corrente '+FTP+'W',data:tPts.map(function(){return FTP;}),borderColor:'rgba(249,115,22,.4)',borderDash:[3,3],pointRadius:0,borderWidth:1}
    ]
  });
}

function renderEF() {
  var series=efSeries(activities,20);
  if(!series.length) return;
  mkChart('ch-ef','line',{
    labels:series.map(function(s){return s.date.slice(5)+(s.native?' ●':'');}),
    datasets:[{label:'EF (NP/HR, ● = nativo Intervals.icu)',data:series.map(function(s){return s.ef;}),borderColor:'#22d46a',backgroundColor:'rgba(34,212,106,.1)',tension:.3,pointRadius:series.map(function(s){return s.native?4:3;}),pointBackgroundColor:'#22d46a',fill:true,borderWidth:1.5}]
  });
}

function renderVI() {
  var series=viSeries(activities,20);
  if(!series.length) return;
  var colors=series.map(function(s){return s.vi<1.05?'rgba(34,212,106,.7)':s.vi<1.10?'rgba(251,191,36,.7)':s.vi<1.15?'rgba(249,115,22,.7)':'rgba(255,77,77,.7)';});
  mkChart('ch-vi','bar',{
    labels:series.map(function(s){return s.date.slice(5)+(s.native?' ●':'');}),
    datasets:[
      {label:'VI',data:series.map(function(s){return s.vi;}),backgroundColor:colors,borderRadius:3,borderWidth:0},
      {label:'1.05',data:series.map(function(){return 1.05;}),type:'line',borderColor:'rgba(34,212,106,.4)',borderDash:[3,3],pointRadius:0,borderWidth:1},
      {label:'1.15',data:series.map(function(){return 1.15;}),type:'line',borderColor:'rgba(255,77,77,.4)',borderDash:[3,3],pointRadius:0,borderWidth:1}
    ]
  });
}

function renderWbal() {
  var cp=cpModel();
  var WpkJ=Math.round(cp.Wp/1000);
  var timeline=buildWbalTimeline();
  if(!timeline.length) return;
  var curr=timeline[timeline.length-1].wbalKJ;
  var col=curr/WpkJ>0.7?'#22d46a':'#ff4d4d';
  var nativeCount=timeline.filter(function(t){return t.source==='icu-native';}).length;
  var streamCount=timeline.filter(function(t){return t.source==='strava-stream';}).length;
  document.getElementById('wbal-kpis').innerHTML=
    '<div class="pk"><div class="pkv">'+cp.CP+'W</div><div class="pkl">CP'+(cp.native?' (nativo)':'')+'</div></div>'+
    '<div class="pk"><div class="pkv">'+WpkJ+'kJ</div><div class="pkl">W\' totale</div></div>'+
    '<div class="pk"><div class="pkv" style="color:'+col+';">'+curr+'kJ</div><div class="pkl">W\' attuale'+(nativeCount?' ('+nativeCount+' native ICU'+(streamCount?', '+streamCount+' stream Strava':'')+')':'')+'</div></div>';
  mkChart('ch-wbal','line',{
    labels:timeline.map(function(w){return w.date.slice(5)+(w.source==='icu-native'?' ●':w.source==='strava-stream'?' ○':'');}),
    datasets:[
      {label:"W' balance (kJ) — ● nativo ICU · ○ stream Strava · senza simbolo = stima",data:timeline.map(function(w){return w.wbalKJ;}),borderColor:'#a78bfa',backgroundColor:'rgba(167,139,250,.1)',tension:.4,pointRadius:timeline.map(function(w){return w.source==='icu-native'?6:w.source==='strava-stream'?5:2;}),pointBackgroundColor:timeline.map(function(w){return w.source==='icu-native'?'#22d46a':w.source==='strava-stream'?'#e8ff47':'#a78bfa';}),fill:true,borderWidth:1.5},
      {label:"W' totale "+WpkJ+"kJ",data:timeline.map(function(){return WpkJ;}),borderColor:'rgba(232,255,71,.3)',borderDash:[4,3],pointRadius:0,borderWidth:1}
    ]
  });
}

function renderBanister() {
  var b=computeBanister();
  var h=b.history.slice(-90);
  if(!h.length) return;
  var proj=projectBanister(30);
  document.getElementById('banister-kpis').innerHTML=
    '<div class="pk"><div class="pkv">'+(h.length?h[h.length-1].perf:0)+'</div><div class="pkl">Form attuale (TRIMP)</div></div>'+
    '<div class="pk"><div class="pkv" style="color:#22d46a;">'+Math.round(proj.peakVal)+'</div><div class="pkl">Peak previsto</div></div>'+
    '<div class="pk"><div class="pkv">'+(proj.peakDate||'—')+'</div><div class="pkl">Data peak</div></div>';
  mkChart('ch-banister','line',{
    labels:h.map(function(d){return d.date.slice(5);}).concat(proj.dates),
    datasets:[
      {label:'Performance TRIMP (reale)',data:h.map(function(d){return d.perf;}).concat(new Array(proj.dates.length).fill(null)),borderColor:'#3b82f6',tension:.4,pointRadius:0,fill:false,borderWidth:1.5},
      {label:'Proiezione piano',data:new Array(h.length).fill(null).concat(proj.perf),borderColor:'#e8ff47',borderDash:[4,3],tension:.4,pointRadius:0,fill:false,borderWidth:1.5}
    ]
  });
}

function renderDecouple() {
  var timeline=buildDecoupleTimeline();
  if(!timeline.length) return;
  var colors=timeline.map(function(d){return d.pct<3?'rgba(34,212,106,.7)':d.pct<5?'rgba(251,191,36,.7)':d.pct<8?'rgba(249,115,22,.7)':'rgba(255,77,77,.7)';});
  mkChart('ch-decouple','bar',{
    labels:timeline.map(function(d){return d.date.slice(5)+' '+d.name.substring(0,8)+(d.source==='icu-native'?' ●':d.source==='strava-stream'?' ○':'');}),
    datasets:[
      {label:'Decoupling % (● = nativo Intervals.icu · ○ = stream Strava)',data:timeline.map(function(d){return d.pct;}),backgroundColor:colors,borderRadius:3,borderWidth:0},
      {label:'Soglia 5%',data:timeline.map(function(){return 5;}),type:'line',borderColor:'rgba(255,77,77,.4)',borderDash:[3,3],pointRadius:0,borderWidth:1}
    ]
  });
}
