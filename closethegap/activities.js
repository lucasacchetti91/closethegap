/* ============================================================
   ACTIVITIES.JS
   Tab Attività: tabella filtrabile con tutte le metriche.
   ============================================================ */

function renderActs() {
  var fm=document.getElementById('f-month').value;
  var fs=document.getElementById('f-search').value.toLowerCase();
  var f=activities.filter(function(a){return(!fm||a.date.startsWith(fm))&&(!fs||a.name.toLowerCase().includes(fs));});
  f.sort(function(a,b){return b.date.localeCompare(a.date);});
  document.getElementById('act-count').textContent=f.length+' attivita';
  document.getElementById('act-empty').style.display=f.length?'none':'block';
  document.getElementById('act-body').innerHTML=f.map(function(a){
    var np=calcNP(a), IF=calcIF(a);
    return '<tr><td>'+a.date+'</td><td>'+(a.isRace?'🏁 ':'')+a.name+'</td>'+
      '<td><span class="bdg '+(a.isRace?'bdg-rc':a.dur>9000?'bdg-g':'bdg-r')+'">'+(a.isRace?'Gara':a.dur>9000?'Granfondo':'Ride')+'</span></td>'+
      '<td>'+fmtDur(a.dur)+'</td><td>'+fmtDist(a.dist)+'</td><td>'+(a.elev||0)+'m</td>'+
      '<td>'+(a.avg_watts?a.avg_watts+'W':'—')+'</td><td>'+(np?'<strong>'+np+'W</strong>':'—')+'</td>'+
      '<td>'+(IF||'—')+'</td><td><strong style="color:var(--acc);">'+calcTSS(a)+'</strong></td>'+
      '<td>'+(a.hr?a.hr+'bpm':'—')+'</td></tr>';
  }).join('');
}
