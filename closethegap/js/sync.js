/* ============================================================
   SYNC.JS
   Sincronizzazione dati: Strava (chat), Intervals.icu (worker live),
   import CSV Garmin, gestione modale "+ Attività".
   ============================================================ */

function syncStrava(){alert('Per sincronizzare le nuove attivita da Strava,\nscrivi in chat a Claude: "Sincronizza Strava"');}

function openAdd(){document.getElementById('a-date').value=dateKey(new Date());document.getElementById('modal-add').classList.add('open');}
function saveAct(){
  var a={id:'manual-'+Date.now(),name:document.getElementById('a-name').value||'Allenamento',date:document.getElementById('a-date').value,
    dur:(parseInt(document.getElementById('a-dur').value)||60)*60,dist:(parseFloat(document.getElementById('a-dist').value)||0)*1000,
    np:parseInt(document.getElementById('a-np').value)||null,_tss_override:parseInt(document.getElementById('a-tss').value)||null,
    elev:parseInt(document.getElementById('a-elev').value)||0,hr:parseInt(document.getElementById('a-hr').value)||null};
  if(!a.date){alert('Inserisci la data!');return;}
  activities.push(a); closeM('modal-add'); renderHome(); saveState();
}
function closeM(id){document.getElementById(id).classList.remove('open');}
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.mo').forEach(function(m){m.addEventListener('click',function(e){if(e.target===m)m.classList.remove('open');});});
});

async function syncIntervals(opts) {
  opts = opts || {};
  var silent = !!opts.silent;
  var btn=document.getElementById('btn-sync-icu');
  var el=document.getElementById('import-status');
  if (!silent) {
    btn.disabled=true;
    btn.querySelector('span:last-child').textContent='Sync...';
    el.textContent='Connessione...'; el.style.color='var(--tx3)';
  }
  try {
    var td=today();
    var from=HISTORY_START; // storico completo
    var p='oldest='+from+'&newest='+td;
    var wResp=await icuFetch('/wellness?'+p);
    if(!wResp.ok) throw new Error('Wellness HTTP '+wResp.status);
    var wellness=await wResp.json();
    if(wellness&&wellness.length){
      var lat=wellness[wellness.length-1];
      if(lat.ctl!=null) document.getElementById('k-ctl').textContent=Math.round(lat.ctl);
      if(lat.atl!=null) document.getElementById('k-atl').textContent=Math.round(lat.atl);
      if(lat.ctl!=null&&lat.atl!=null){
        var tsb=Math.round(lat.ctl-lat.atl);
        var te=document.getElementById('k-tsb');
        te.textContent=tsb;
        te.className='kv '+(tsb>5?'kv-up':tsb<-10?'kv-dn':'kv-wa');
      }
    }
    var aResp=await icuFetch('/activities?'+p);
    if(!aResp.ok) throw new Error('Activities HTTP '+aResp.status);
    var icuActs=await aResp.json();
    var imported=0, updated=0;
    icuActs.forEach(function(ia){
      if(!ia.start_date_local) return;
      var date=ia.start_date_local.slice(0,10);
      var type=(ia.type||'').toLowerCase();
      if(!type.match(/ride|cycling|virtualride/)) return;
      var np=ia.icu_normalized_watts||null, tss=ia.icu_training_load||null,
          ifv=ia.icu_intensity||null, avgW=ia.icu_average_watts||null,
          hr=ia.average_heartrate||null, maxHr=ia.max_heartrate||null,
          dist=Math.round(ia.distance||0), dur=ia.moving_time||0,
          elev=ia.total_elevation_gain||0, cal=ia.calories||null;
      var ex=activities.find(function(a){return a.date===date&&Math.abs((a.dist||0)-dist)<3000;});
      if(ex){
        if(np) ex.np=np; if(avgW) ex.avg_watts=avgW;
        if(tss){ex.tss_real=tss;ex._tss_override=tss;}
        if(ifv) ex.if_val=ifv; if(hr) ex.hr=hr; if(maxHr) ex.max_hr=maxHr; if(cal) ex.cal=cal;
        if (ia.id != null) ex.icu_id = ia.id;
        ex.source='intervals'; updated++;
      } else {
        activities.push({id:'icu-'+(ia.id||date),icu_id:ia.id,name:ia.name||'Uscita',date:date,dur:dur,dist:dist,
          elev:elev,avg_watts:avgW,np:np,_tss_override:tss,tss_real:tss,if_val:ifv,
          hr:hr,max_hr:maxHr,cal:cal,isRace:ia.race||false,source:'intervals'});
        imported++;
      }
    });
    renderHome();
    saveState();
    if (!silent) { el.textContent='✅ +'+imported+' nuove, '+updated+' aggiornate'; el.style.color='var(--grn)'; }
  } catch(e) {
    if (!silent) { el.textContent='❌ '+e.message; el.style.color='var(--red)'; }
    console.error('Intervals sync error:',e);
    if (silent) throw e; // il bootstrap decide come reagire (resta sui dati in cache)
  } finally {
    if (!silent) {
      btn.disabled=false;
      btn.querySelector('span:last-child').textContent='Sync Intervals.icu';
    }
  }
}

function importGarminFile(evt){
  var file=evt.target.files[0]; if(!file) return;
  var reader=new FileReader();
  reader.onload=function(e){parseGarminCSV(e.target.result);};
  reader.readAsText(file,'utf-8');
}
function parseGarminCSV(raw){
  var lines=raw.split('\n').filter(function(l){return l.trim();});
  function parseRow(line){var vals=[],cur='',inQ=false;for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){vals.push(cur.trim());cur='';}else cur+=ch;}vals.push(cur.trim());return vals;}
  var headers=parseRow(lines[0]).map(function(h){return h.replace(/\uFEFF/g,'').trim();});
  function idx(k){return headers.findIndex(function(h){return h===k;});}
  /* Garmin esporta i CSV con formattazione italiana: punto come separatore
     delle migliaia, virgola come decimale. Va normalizzato prima di parseFloat. */
  function cn(v){if(!v||v===''||v==='--')return null;var n=parseFloat(v.replace(/\./g,'').replace(',','.').replace(/[^0-9.\-]/g,''));return isNaN(n)?null:n;}
  function pd(v){if(!v)return 0;var p=v.trim().split(':').map(Number);if(p.length===3)return p[0]*3600+p[1]*60+p[2];if(p.length===2)return p[0]*60+p[1];return 0;}
  var COL={tipo:'Tipo di attivita',data:'Data',titolo:'Titolo',dist:'Distanza',cal:'Calorie',tempo:'Tempo',hr:'FC Media',hrmax:'FC max',asc:'Ascesa totale',np:'Normalized Power® (NP®)',tss:'Training Stress Score®',pavg:'Potenza media'};
  var imported=0, updated=0;
  for(var i=1;i<lines.length;i++){
    var vals=parseRow(lines[i]);
    function get(k){return vals[idx(COL[k])]?vals[idx(COL[k])].trim():null;}
    if(!(get('tipo')||'').match(/ciclismo|cycling|ride|bici/i)) continue;
    var rawDate=get('data'); if(!rawDate) continue;
    /* FIX build precedente: usare toISOString() qui sposta la data di un
       giorno per i fusi orari a est di UTC. Costruiamo la chiave data
       manualmente (già fatto: prendiamo solo i primi 10 caratteri del
       campo Data di Garmin, che è già locale). */
    var date=rawDate.trim().slice(0,10);
    var distKm=cn(get('dist'))||0, dist=Math.round(distKm*1000);
    var np=cn(get('np')), pavg=cn(get('pavg')), tss_r=cn(get('tss'));
    var ex=activities.find(function(a){return a.date===date&&Math.abs((a.dist||0)-dist)<2000;});
    if(ex){
      if(np)ex.np=np; if(pavg)ex.avg_watts=pavg;
      if(tss_r){ex.tss_real=tss_r;ex._tss_override=tss_r;}
      var hr2=cn(get('hr')),mhr=cn(get('hrmax')),cal2=cn(get('cal'));
      if(hr2)ex.hr=hr2; if(mhr)ex.max_hr=mhr; if(cal2)ex.cal=cal2;
      ex.source='garmin'; updated++;
    } else {
      activities.push({id:'garmin-'+date+'-'+i,name:get('titolo')||'Uscita',date:date,dur:pd(get('tempo')),dist:dist,elev:cn(get('asc'))||0,avg_watts:pavg,np:np,_tss_override:tss_r,tss_real:tss_r,hr:cn(get('hr')),max_hr:cn(get('hrmax')),cal:cn(get('cal')),source:'garmin'});
      imported++;
    }
  }
  var el=document.getElementById('import-status');
  el.textContent='✅ CSV: +'+imported+' nuove, '+updated+' aggiornate'; el.style.color='var(--grn)';
  renderHome(); saveState();
}
