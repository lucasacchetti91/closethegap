/* ============================================================
   PLAN.JS
   Piano di allenamento (11 settimane, 30 giu - 19 set 2026),
   render tab Piano, e adattamento automatico basato su TSB/ATL/CTL.
   ============================================================ */

/* ============================================================
   PLAN.JS
   Piano di allenamento: le settimane PASSATE restano un registro
   storico fisso (quello che è stato davvero prescritto), le settimane
   FUTURE sono generate algoritmicamente da plan-generator.js usando i
   tuoi dati reali (CP/W'/Pmax, ramp rate dimostrato, polarizzazione,
   profilo delle gare analizzate). adaptPlan() ora rigenera per intero
   la parte futura invece di applicare piccoli +/- percentuali.
   ============================================================ */

var HISTORICAL_PLAN=[
    {date:"2026-07-23",week:"Sett. 4 · Carico FTP + Gara 25 lug",name:"Z2 Aerobico",type:"z2",tss:70,durMin:90,desc:"90' Z2 225-238W.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:10},{z:2,l:"Z2",lo:55,hi:75,d:70},{z:1,l:"CD",lo:0,hi:55,d:10}]},
    {date:"2026-07-24",week:"Sett. 4 · Carico FTP + Gara 25 lug",name:"Riposo + Carb Loading",type:"off",tss:0,durMin:0,desc:"Riposo. Carboidrati, idratazione, sonno.",blocks:[]},
    {date:"2026-07-25",week:"Sett. 4 · Carico FTP + Gara 25 lug",name:"GARA — 25 Luglio",type:"race",tss:160,durMin:180,desc:"Parti controllato nei primi 20'. Usa la gara come stimolo FTP.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:4,l:"Gara",lo:90,hi:105,d:150},{z:1,l:"CD",lo:0,hi:55,d:15}]},
    {date:"2026-07-26",week:"Sett. 4 · Carico FTP + Gara 25 lug",name:"Recupero Z1",type:"z1",tss:20,durMin:45,desc:"45' Z1 leggero post-gara.",blocks:[{z:1,l:"Z1",lo:0,hi:55,d:45}]},
    {date:"2026-07-27",week:"Sett. 4 · Carico FTP + Gara 25 lug",name:"VO2max 5x4'",type:"z5",tss:88,durMin:70,desc:"WU 15', poi 5x4' a 357-374W (105-110% FTP), rec 4' Z1, CD 10'.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:5,l:"VO2",lo:105,hi:110,d:4},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:4},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:4},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:4},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:4},{z:1,l:"CD",lo:0,hi:55,d:5}]},
    {date:"2026-07-28",week:"Sett. 5 · Carico FTP",name:"Riposo",type:"off",tss:0,durMin:0,desc:"Riposo.",blocks:[]},
    {date:"2026-07-29",week:"Sett. 5 · Carico FTP",name:"Soglia 3x12'",type:"z4",tss:92,durMin:85,desc:"WU 15', poi 3x12' a 326-340W (96-100% FTP), rec 4' Z1, CD 10'.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:4,l:"Soglia",lo:96,hi:100,d:12},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:4,l:"Soglia",lo:96,hi:100,d:12},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:4,l:"Soglia",lo:96,hi:100,d:12},{z:1,l:"CD",lo:0,hi:55,d:10}]},
    {date:"2026-07-30",week:"Sett. 5 · Carico FTP",name:"Z2 Lungo",type:"z2",tss:78,durMin:100,desc:"100' Z2 228-242W.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:10},{z:2,l:"Z2",lo:55,hi:75,d:80},{z:1,l:"CD",lo:0,hi:55,d:10}]},
    {date:"2026-07-31",week:"Sett. 5 · Carico FTP",name:"VO2max 4x5'",type:"z5",tss:90,durMin:75,desc:"WU 15', poi 4x5' a 352-368W (103-108% FTP), rec 5' Z1, CD 10'.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:5,l:"VO2",lo:103,hi:108,d:5},{z:1,l:"Rec",lo:0,hi:55,d:5},{z:5,l:"VO2",lo:103,hi:108,d:5},{z:1,l:"Rec",lo:0,hi:55,d:5},{z:5,l:"VO2",lo:103,hi:108,d:5},{z:1,l:"Rec",lo:0,hi:55,d:5},{z:5,l:"VO2",lo:103,hi:108,d:5},{z:1,l:"CD",lo:0,hi:55,d:5}]},
    {date:"2026-08-01",week:"Sett. 5 · Carico FTP",name:"Riposo",type:"off",tss:0,durMin:0,desc:"Riposo.",blocks:[]},
    {date:"2026-08-02",week:"Sett. 5 · Carico FTP",name:"Lungo Z2 + Soglia",type:"z2",tss:135,durMin:180,desc:"2h30 Z2, poi 20' a 323-340W. Simula la fatica di gara.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:2,l:"Z2",lo:55,hi:75,d:130},{z:4,l:"Soglia",lo:95,hi:100,d:20},{z:1,l:"CD",lo:0,hi:55,d:15}]},
    {date:"2026-08-03",week:"Sett. 5 · Carico FTP",name:"Recupero Z1",type:"z1",tss:25,durMin:50,desc:"50' Z1.",blocks:[{z:1,l:"Z1",lo:0,hi:55,d:50}]},
    {date:"2026-08-04",week:"Sett. 6 · Picco Carico",name:"Riposo",type:"off",tss:0,durMin:0,desc:"Riposo.",blocks:[]},
    {date:"2026-08-05",week:"Sett. 6 · Picco Carico",name:"Soglia 2x20'",type:"z4",tss:98,durMin:90,desc:"WU 15', poi 2x20' a 330-348W (97-102% FTP), rec 6' Z1, CD 10'. Sessione chiave.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:4,l:"Soglia",lo:97,hi:102,d:20},{z:1,l:"Rec",lo:0,hi:55,d:6},{z:4,l:"Soglia",lo:97,hi:102,d:20},{z:1,l:"CD",lo:0,hi:55,d:10}]},
    {date:"2026-08-06",week:"Sett. 6 · Picco Carico",name:"Z2 Aerobico",type:"z2",tss:72,durMin:90,desc:"90' Z2 230-245W.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:10},{z:2,l:"Z2",lo:55,hi:75,d:70},{z:1,l:"CD",lo:0,hi:55,d:10}]},
    {date:"2026-08-07",week:"Sett. 6 · Picco Carico",name:"VO2max 6x4'",type:"z5",tss:96,durMin:80,desc:"WU 15', poi 6x4' a 357-374W (105-110% FTP), rec 4' Z1, CD 10'.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:5,l:"VO2",lo:105,hi:110,d:4},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:4},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:4},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:4},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:4},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:4},{z:1,l:"CD",lo:0,hi:55,d:5}]},
    {date:"2026-08-09",week:"Sett. 6 · Picco Carico",name:"Lungo Z2 3h",type:"z2",tss:128,durMin:180,desc:"3h Z2 228-242W.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:2,l:"Z2",lo:55,hi:75,d:150},{z:1,l:"CD",lo:0,hi:55,d:15}]},
    {date:"2026-08-12",week:"Sett. 7 · Scarico",name:"Z1-Z2 Leggero",type:"z2",tss:42,durMin:60,desc:"60' Z1-Z2 sotto 220W.",blocks:[{z:1,l:"Z1",lo:0,hi:55,d:15},{z:2,l:"Z2",lo:55,hi:75,d:40},{z:1,l:"CD",lo:0,hi:55,d:5}]},
    {date:"2026-08-13",week:"Sett. 7 · Scarico",name:"Sweet Spot 2x10'",type:"z3",tss:62,durMin:65,desc:"WU 15', poi 2x10' a 285-298W, rec 5' Z1, CD 10'.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:3,l:"SS",lo:83,hi:87,d:10},{z:1,l:"Rec",lo:0,hi:55,d:5},{z:3,l:"SS",lo:83,hi:87,d:10},{z:1,l:"CD",lo:0,hi:55,d:10}]},
    {date:"2026-08-19",week:"Sett. 8 · Affilatura",name:"Soglia 3x10'",type:"z4",tss:88,durMin:80,desc:"WU 15', poi 3x10' a 330-348W, rec 4' Z1, CD 10'.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:4,l:"Soglia",lo:97,hi:102,d:10},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:4,l:"Soglia",lo:97,hi:102,d:10},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:4,l:"Soglia",lo:97,hi:102,d:10},{z:1,l:"CD",lo:0,hi:55,d:10}]},
    {date:"2026-08-21",week:"Sett. 8 · Affilatura",name:"VO2max 5x3'",type:"z5",tss:82,durMin:70,desc:"WU 15', poi 5x3' a 357-374W, rec 4' Z1, CD 10'.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:5,l:"VO2",lo:105,hi:110,d:3},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:3},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:3},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:3},{z:1,l:"Rec",lo:0,hi:55,d:4},{z:5,l:"VO2",lo:105,hi:110,d:3},{z:1,l:"CD",lo:0,hi:55,d:5}]},
    {date:"2026-08-26",week:"Sett. 9 · Picco Forma",name:"Soglia 2x15' Test FTP",type:"z4",tss:85,durMin:75,desc:"WU 15', poi 2x15' a 333-348W. Usa questa sessione per stimare la nuova FTP.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:4,l:"Soglia",lo:98,hi:102,d:15},{z:1,l:"Rec",lo:0,hi:55,d:5},{z:4,l:"Soglia",lo:98,hi:102,d:15},{z:1,l:"CD",lo:0,hi:55,d:10}]},
    {date:"2026-09-02",week:"Sett. 10 · Pre-tapering",name:"Soglia 2x12'",type:"z4",tss:78,durMin:70,desc:"WU 15', poi 2x12' a 340-357W (100-105% FTP), rec 5' Z1, CD 10'.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:4,l:"Soglia",lo:100,hi:105,d:12},{z:1,l:"Rec",lo:0,hi:55,d:5},{z:4,l:"Soglia",lo:100,hi:105,d:12},{z:1,l:"CD",lo:0,hi:55,d:10}]},
    {date:"2026-09-09",week:"Sett. 11 · Tapering Finale",name:"Z1-Z2 Leggero",type:"z2",tss:38,durMin:55,desc:"55' Z1-Z2.",blocks:[{z:1,l:"Z1",lo:0,hi:55,d:15},{z:2,l:"Z2",lo:55,hi:75,d:35},{z:1,l:"CD",lo:0,hi:55,d:5}]},
    {date:"2026-09-10",week:"Sett. 11 · Tapering Finale",name:"Attivazione Soglia 2x8'",type:"z4",tss:58,durMin:65,desc:"WU 15', poi 2x8' a 323-348W, rec 5' Z1, CD 10'. Ultima sessione di qualita.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:4,l:"Soglia",lo:95,hi:102,d:8},{z:1,l:"Rec",lo:0,hi:55,d:5},{z:4,l:"Soglia",lo:95,hi:102,d:8},{z:1,l:"CD",lo:0,hi:55,d:10}]},
    {date:"2026-09-16",week:"Sett. 11 · Tapering Finale",name:"Attivazione 20'",type:"z2",tss:14,durMin:20,desc:"20': Z1 poi 2x45'' progressivi fino a 289W.",blocks:[{z:1,l:"Z1",lo:0,hi:55,d:10},{z:3,l:"Prog",lo:70,hi:85,d:0.75},{z:1,l:"Rec",lo:0,hi:55,d:2},{z:3,l:"Prog",lo:70,hi:85,d:0.75},{z:1,l:"Z1",lo:0,hi:55,d:5}]},
    {date:"2026-09-19",week:"Sett. 11 · Tapering Finale",name:"GARA — 19 Settembre",type:"race",tss:200,durMin:240,desc:"OBIETTIVO STAGIONALE. WU 15' con 2-3 strappi a 289W. Mai sopra 360W nelle prime salite. 60-70g carbo/ora. TSB atteso +15/+20.",blocks:[{z:1,l:"WU",lo:0,hi:55,d:15},{z:2,l:"Z2",lo:55,hi:75,d:60},{z:4,l:"Climb",lo:90,hi:106,d:120},{z:5,l:"Finale",lo:105,hi:112,d:30},{z:1,l:"CD",lo:0,hi:55,d:15}]}
];

/* Metadati dell'ultima generazione (mostrati nella tab Piano: ramp
   rate usato, se sei polarizzato, profilo gare) - per trasparenza,
   non è una scatola nera. */
var lastPlanGenMeta = null;

function makePlan(){
  var td = today();
  // Registro storico: solo ciò che è già passato, invariato.
  var past = HISTORICAL_PLAN.filter(function(p){ return p.date < td && p.date !== GOAL_DATE; });
  // Evento fisso: il giorno della gara obiettivo resta sempre quello
  // scritto a mano (non va rigenerato).
  var goalEntry = HISTORICAL_PLAN.find(function(p){ return p.date === GOAL_DATE; });
  // Tutto il resto (da oggi al giorno prima della gara) è rigenerato
  // sui dati reali.
  var gen = generateFuturePlan(td < GOAL_DATE ? td : GOAL_DATE, GOAL_DATE);
  lastPlanGenMeta = gen.meta;
  plan = past.concat(gen.sessions);
  if (goalEntry) plan.push(goalEntry);
  plan.sort(function(a,b){ return a.date.localeCompare(b.date); });
}

var PHASE_COLORS = {
  'Costruzione':'#3b82f6', 'Picco Forma':'#f97316',
  'Affilatura':'#a78bfa', 'Tapering Finale':'#22d46a'
};
var showPastSessions = false;

function phaseOf(weekLabel) {
  var parts = (weekLabel||'').split('·');
  return parts.length>1 ? parts[1].trim() : 'Costruzione';
}

/* Vista macrociclo: barra delle fasi in alto + una colonna per
   settimana con il TSS pianificato (e, per le settimane passate, il TSS
   realmente svolto sovrapposto). Ispirata all'Annual Training Plan di
   TrainingPeaks: prima la visione d'insieme, poi il dettaglio. */
function renderMacrocycle(weeks, weekKeys) {
  var td = today();
  var maxTSS = Math.max.apply(null, weekKeys.map(function(k){
    return weeks[k].reduce(function(s,p){return s+(p.tss||0);},0);
  }).concat([1]));

  // Raggruppa settimane consecutive della stessa fase per la banda in alto
  var bands = [];
  weekKeys.forEach(function(k){
    var ph = phaseOf(k);
    if (bands.length && bands[bands.length-1].phase===ph) bands[bands.length-1].count++;
    else bands.push({phase:ph, count:1});
  });

  var html = '<div class="atp-card">';
  html += '<div class="ct" style="margin-bottom:12px;">Macrociclo — verso il '+GOAL_DATE.split('-').reverse().join('/')+'</div>';

  html += '<div class="atp-phases">';
  bands.forEach(function(b){
    var c = PHASE_COLORS[b.phase]||'#4a5168';
    html += '<div class="atp-phase" style="flex:'+b.count+';background:'+c+'22;color:'+c+';border-bottom:2px solid '+c+';">'+b.phase+'</div>';
  });
  html += '</div>';

  html += '<div class="atp-weeks">';
  weekKeys.forEach(function(k){
    var items = weeks[k];
    var planTSS = items.reduce(function(s,p){return s+(p.tss||0);},0);
    var ph = phaseOf(k);
    var c = PHASE_COLORS[ph]||'#4a5168';
    var isPast = items.every(function(p){return p.date < td;});
    var isCurrent = items.some(function(p){
      var mon=new Date(); mon.setDate(mon.getDate()-mon.getDay()+1); mon.setHours(0,0,0,0);
      var sun=new Date(mon); sun.setDate(mon.getDate()+6);
      var d=new Date(p.date+'T12:00'); return d>=mon && d<=sun;
    });
    var actualTSS = items.reduce(function(s,p){
      return s + activities.filter(function(a){return a.date===p.date;}).reduce(function(x,a){return x+calcTSS(a);},0);
    },0);
    var hasRace = items.some(function(p){return p.type==='race';});
    var planH = Math.round(planTSS/maxTSS*100);
    var actH = Math.round(actualTSS/maxTSS*100);
    var wkNum = (k.match(/Sett\.\s*(\d+)/)||[])[1] || '';

    html += '<div class="atp-week'+(isCurrent?' atp-week-current':'')+'" title="'+k+' — pianificato '+planTSS+' TSS'+(actualTSS?', svolto '+actualTSS+' TSS':'')+'">';
    html += '<div class="atp-tss">'+(hasRace?'🏁':planTSS)+'</div>';
    if (isPast || isCurrent) {
      // barra svolto (piena) sovrapposta alla pianificata (trasparente)
      html += '<div class="atp-bar" style="height:'+Math.max(planH-actH,0)+'%;background:'+c+'33;"></div>';
      html += '<div class="atp-bar-actual" style="height:'+Math.min(actH,100)+'%;background:'+c+';"></div>';
    } else {
      html += '<div class="atp-bar" style="height:'+planH+'%;background:'+c+'99;"></div>';
    }
    html += '<div class="atp-wlabel">'+wkNum+'</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="atp-legend">';
  Object.keys(PHASE_COLORS).forEach(function(p){
    html += '<span><i class="atp-dot" style="background:'+PHASE_COLORS[p]+'"></i>'+p+'</span>';
  });
  html += '<span><i class="atp-dot" style="background:#3b82f699"></i>pianificato</span>';
  html += '<span><i class="atp-dot" style="background:#3b82f6"></i>svolto</span>';
  html += '</div></div>';
  return html;
}

function togglePastSessions() {
  showPastSessions = !showPastSessions;
  renderPlanPage();
}

function renderPlanPage() {
  var meta = lastPlanGenMeta;
  var metaEl = document.getElementById('plan-gen-meta');
  if (metaEl && meta) {
    metaEl.innerHTML =
      '<strong style="color:var(--acc);">Generazione piano futuro — metodi usati</strong><br>'+
      'CP attuale: <strong>'+meta.CP+'W</strong> · W\': <strong>'+Math.round(meta.Wp/1000)+'kJ</strong> (individualizza tutte le zone)<br>'+
      'Ramp rate applicato: <strong>'+meta.rampRate+' CTL/settimana</strong> (dal tuo storico, clampato 3-8 per sicurezza)<br>'+
      (meta.polarization ? ('Polarizzazione ultimi 42gg: <strong>'+meta.polarization.lowPct+'% bassa / '+meta.polarization.highPct+'% alta intensità</strong> ('+(meta.polarization.polarized?'80/20 rispettato':'sbilanciata verso l\'alta intensità — sessioni qualità ridotte')+')<br>') : '') +
      (meta.raceProfile ? ('Profilo gare analizzate: <strong>'+meta.raceProfile.count+' gare</strong>, '+meta.raceProfile.avgDurMin+"' medi, decoupling medio "+meta.raceProfile.avgDecoupling+'%') : '');
  }

  var td = today();
  var weeks={}, weekKeys=[];
  plan.forEach(function(p){
    if(!weeks[p.week]){weeks[p.week]=[];weekKeys.push(p.week);}
    weeks[p.week].push(p);
  });

  var html = renderMacrocycle(weeks, weekKeys);

  // Dettaglio: di default solo le settimane che contengono giorni futuri.
  var pastWeeks = weekKeys.filter(function(k){ return weeks[k].every(function(p){return p.date<td;}); });
  var visibleKeys = showPastSessions ? weekKeys : weekKeys.filter(function(k){ return weeks[k].some(function(p){return p.date>=td;}); });

  if (pastWeeks.length) {
    html += '<button class="plan-past-toggle" onclick="togglePastSessions()">'+
            (showPastSessions ? '▾ Nascondi le '+pastWeeks.length+' settimane passate' : '▸ Mostra anche le '+pastWeeks.length+' settimane passate')+
            '</button>';
  }

  var TM={z1:'pc-z2',z2:'pc-z2',z3:'pc-z3',z4:'pc-z4',z5:'pc-z5',z6:'pc-z5',race:'pc-race',off:'pc-off'};
  visibleKeys.forEach(function(wk){
    var items = weeks[wk];
    // dentro una settimana in corso, i giorni già passati restano visibili ma sbiaditi
    var shown = showPastSessions ? items : items.filter(function(p){ return p.date>=td || !weeks[wk].every(function(x){return x.date<td;}); });
    var wTSS = items.reduce(function(s,p){return s+(p.tss||0);},0);
    var ph = phaseOf(wk);
    var pc = PHASE_COLORS[ph]||'#4a5168';
    html+='<div class="plan-week-block"><div class="pwb-header">'+
          '<div class="pwb-title"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+pc+';margin-right:7px;"></span>'+wk+'</div>'+
          '<div class="pwb-tss">'+wTSS+' TSS settimana</div></div><div class="plan-day-grid">';
    shown.forEach(function(p){
      var done=activities.find(function(a){return a.date===p.date;});
      var isT=p.date===td, isPast=p.date<td;
      var cls='plan-card '+(TM[p.type]||'pc-z2')+(done?' pc-done':'')+(isT?' pc-today':'')+(isPast&&!done?' pc-past':'');
      var dl=new Date(p.date+'T12:00').toLocaleDateString('it',{weekday:'short',day:'2-digit',month:'2-digit'});
      html+='<div class="'+cls+'"><div class="pc-header"><span class="pc-date">'+dl+'</span><span class="pc-name">'+p.name+'</span><span class="pc-tss-lbl">'+p.tss+' TSS</span></div>';
      if (done) html+='<div style="font-size:.62rem;color:var(--grn);margin-bottom:4px;">✅ '+calcTSS(done)+' TSS reale · '+fmtDist(done.dist)+'km</div>';
      html+='<div class="pc-desc">'+p.desc.substring(0,150)+(p.desc.length>150?'…':'')+'</div>';
      if (p.blocks&&p.blocks.length&&p.type!=='off') html+=renderWorkoutBlock(p);
      if (p.adaptNote) html+='<div class="pc-adapt">⚡ '+p.adaptNote+'</div>';
      html+='</div>';
    });
    html+='</div></div>';
  });

  document.getElementById('plan-render').innerHTML=html||'<div class="empty">Nessun piano.</div>';
}

function adaptPlan() {
  makePlan(); // rigenerazione completa della parte futura sui dati reali attuali
  var pmc=computePMC();
  var tsb=pmc.tsb, ctl=pmc.ctl, atl=pmc.atl, td=today();

  // Controllo di sicurezza a breve termine (3gg) che il generatore
  // settimanale non copre: se hai appena incassato un carico enorme,
  // segnala di alleggerire la prossima sessione qualità anche se il
  // piano rigenerato non lo prevedeva già.
  var last3=0;
  for(var i=1;i<=3;i++){var d=new Date();d.setDate(d.getDate()-i);last3+=activities.filter(function(a){return a.date===dateKey(d);}).reduce(function(s,a){return s+calcTSS(a);},0);}
  var adapted=0;
  if (last3>200) {
    var nextQuality = plan.find(function(p){ return p.date>td && (p.type==='z4'||p.type==='z5'); });
    if (nextQuality) { nextQuality.tss=Math.max(Math.round(nextQuality.tss*.8),20); nextQuality.adaptNote='Ultimi 3gg: '+last3+' TSS. Intensità ridotta del 20% per sicurezza.'; adapted++; }
  }

  /* Controllo di recupero dai dati Garmin (sonno/HRV/FC riposo via
     Intervals.icu). Reagisce solo a trend su 7 giorni contro baseline
     42, mai a un singolo giorno storto. Se ci sono due o più segnali
     concordi, alleggerisce la prossima sessione dura. */
  var rec = (typeof recoveryStatus==='function') ? recoveryStatus() : null;
  var recMsg = '';
  if (rec && rec.score==='alert') {
    var nq = plan.find(function(p){ return p.date>td && (p.type==='z4'||p.type==='z5'||p.type==='z6'); });
    if (nq && !nq.adaptNote) {
      nq.tss=Math.max(Math.round(nq.tss*.75),20);
      nq.adaptNote='Segnali di recupero incompleto ('+rec.flags.map(function(f){return f.label;}).join(', ')+'): carico ridotto del 25%.';
      adapted++;
    }
    recMsg = '<br><span style="color:var(--red);">⚠ Recupero: '+rec.flags.map(function(f){return f.label+' '+(f.deltaPct>0?'+':'')+Math.round(f.deltaPct)+'%';}).join(' · ')+' vs baseline.</span>';
  } else if (rec && rec.score==='warn') {
    recMsg = '<br><span style="color:var(--yel);">Recupero: '+rec.flags.map(function(f){return f.label;}).join(', ')+' fuori baseline — tienilo d\'occhio.</span>';
  } else if (rec) {
    recMsg = '<br><span style="color:var(--grn);">Recupero nella norma (sonno/HRV/FC riposo in linea con la tua baseline).</span>';
  }

  var meta = lastPlanGenMeta || {};
  var col=tsb<-10?'#ff4d4d':tsb>5?'#22d46a':'#fbbf24';
  var msg='<strong style="color:'+col+';">TSB '+tsb+'</strong> · CTL '+Math.round(ctl)+' · ATL '+Math.round(atl)+'.<br>';
  msg+='Piano futuro rigenerato: ramp rate '+(meta.rampRate||'—')+' CTL/sett (dal tuo storico) · ';
  msg+=meta.polarization ? ('polarizzazione '+meta.polarization.lowPct+'% bassa/'+meta.polarization.highPct+'% alta intensità ('+(meta.polarization.polarized?'ok, 80/20 rispettato':'sbilanciata, ridotte le sessioni qualità questa settimana')+')') : '';
  if (adapted>0) msg+='<br><strong>⚡ '+adapted+' sessione alleggerita.</strong>';
  msg+=recMsg;
  var el=document.getElementById('adapt-msg'); el.innerHTML=msg; el.style.display='block';
  renderTodayCard(today()); renderWeekStrip();
  if(document.getElementById('page-plan').classList.contains('active')) renderPlanPage();
}
