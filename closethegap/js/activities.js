/* ============================================================
   ACTIVITIES.JS
   Tab Attività: feed scorribile in stile Strava. Ogni scheda mostra i
   dati di riepilogo; espandendola vengono scaricati e disegnati mappa
   del percorso, altimetria e best effort (vedi activity-detail.js).

   Il vecchio layout a tabella è stato sostituito: con 10+ colonne era
   illeggibile su mobile e non lasciava spazio a mappa/altimetria.
   ============================================================ */

var expandedActivities = {};

function toggleActivityDetail(idx, icuId) {
  var panelId='ad-panel-'+idx;
  var panel=document.getElementById(panelId);
  var btn=document.getElementById('ad-btn-'+idx);
  if (!panel) return;
  var isOpen=expandedActivities[idx];
  expandedActivities[idx]=!isOpen;
  panel.style.display=isOpen?'none':'block';
  if (btn) btn.textContent=isOpen?'▸ Dettagli':'▾ Chiudi';
  if (!isOpen) {
    if (!icuId) { panel.innerHTML='<div class="ad-nodata">Questa attività non ha un id Intervals.icu: sincronizza per scaricarne i dettagli.</div>'; return; }
    loadActivityDetail(icuId, panelId);
  }
}

/* Estrae l'id numerico Intervals.icu da un id locale tipo "icu-12345". */
function icuIdOf(a) {
  /* Restituisce l'id Intervals.icu SOLO se lo conosciamo davvero.
     BUG CORRETTO: la versione precedente accettava qualsiasi id
     numerico, quindi passava gli id STRAVA dei dati seed hardcoded
     agli endpoint /activity/{id}/... di Intervals.icu, che rispondeva
     422. Un id numerico di origine ignota non è un id ICU. */
  if (a.icu_id != null) return String(a.icu_id);
  if (!a.id) return null;
  var s = String(a.id);
  if (s.indexOf('icu-') === 0) return s.slice(4);
  return null;
}

function renderActs() {
  var fm=document.getElementById('f-month').value;
  var fs=document.getElementById('f-search').value.toLowerCase();
  var f=activities.filter(function(a){return(!fm||a.date.startsWith(fm))&&(!fs||a.name.toLowerCase().includes(fs));});
  f.sort(function(a,b){return b.date.localeCompare(a.date);});
  document.getElementById('act-count').textContent=f.length+' attività';
  document.getElementById('act-empty').style.display=f.length?'none':'block';

  document.getElementById('act-feed').innerHTML=f.map(function(a,idx){
    var np=calcNP(a), IF=calcIF(a), tss=calcTSS(a);
    var icuId=icuIdOf(a);
    var kind=a.isRace?'Gara':a.dur>9000?'Granfondo':'Ride';
    var kindCls=a.isRace?'bdg-rc':a.dur>9000?'bdg-g':'bdg-r';
    var dl=new Date(a.date+'T12:00').toLocaleDateString('it',{weekday:'short',day:'numeric',month:'short'});

    var stats=[
      {v:fmtDist(a.dist), u:'km'},
      {v:fmtDur(a.dur), u:'tempo'},
      {v:(a.elev||0), u:'m D+'},
      {v:np?np+'W':'—', u:'NP'},
      {v:IF||'—', u:'IF'},
      {v:tss, u:'TSS', acc:true},
      {v:a.hr?a.hr:'—', u:'bpm'}
    ];

    var badges='';
    if (a.icu_decoupling!=null) badges+='<span class="feed-tag">Pw:Hr '+a.icu_decoupling.toFixed(1)+'%</span>';
    if (a.icu_vi!=null) badges+='<span class="feed-tag">VI '+a.icu_vi.toFixed(2)+'</span>';
    if (a.icu_wbal_depletion_kj!=null) badges+='<span class="feed-tag">W\' -'+Math.abs(a.icu_wbal_depletion_kj).toFixed(1)+'kJ</span>';

    return '<div class="feed-card">'+
      '<div class="feed-head">'+
        '<div><div class="feed-title">'+(a.isRace?'🏁 ':'')+a.name+'</div>'+
        '<div class="feed-date">'+dl+' '+a.date.slice(0,4)+'</div></div>'+
        '<span class="bdg '+kindCls+'">'+kind+'</span>'+
      '</div>'+
      '<div class="feed-stats">'+stats.map(function(s){
        return '<div class="feed-stat"><div class="fs-v"'+(s.acc?' style="color:var(--acc)"':'')+'>'+s.v+'</div><div class="fs-u">'+s.u+'</div></div>';
      }).join('')+'</div>'+
      (badges?'<div class="feed-tags">'+badges+'</div>':'')+
      '<button class="feed-toggle" id="ad-btn-'+idx+'" onclick="toggleActivityDetail('+idx+','+(icuId?"'"+icuId+"'":'null')+')">▸ Dettagli</button>'+
      '<div class="ad-panel" id="ad-panel-'+idx+'" style="display:none;"></div>'+
    '</div>';
  }).join('');
  expandedActivities={};
}
