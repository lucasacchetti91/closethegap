/* ============================================================
   METRICS.JS
   Metriche base per-attività (TSS, NP, IF) e Performance Management
   Chart (CTL/ATL/TSB). Dipende da config.js.
   ============================================================ */

function fmtDist(m) { return (m/1000).toFixed(1); }
function fmtDur(s) { var h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h?h+'h'+String(m).padStart(2,'0'):m+'min'; }
function dateKey(d) {
  if (typeof d === 'string') return d;
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function today() { return dateKey(new Date()); }

/* Priorità di calcolo TSS (invariata dal progetto originale):
   1. TSS reale da Garmin/Intervals.icu (_tss_override / tss_real)
   2. Formula basata su NP reale
   3. Stima NP da potenza media (avg_watts * 1.05)
   4. Fallback su Relative Effort di Strava, poi su durata */
function calcTSS(a) {
  if (a._tss_override||a.tss_real) return Math.round(a._tss_override||a.tss_real);
  if (a.np) { var IF=a.np/FTP; return Math.round((a.dur*a.np*IF)/(FTP*3600)*100); }
  if (a.avg_watts) { var np2=Math.round(a.avg_watts*1.05); var IF2=np2/FTP; return Math.round((a.dur*np2*IF2)/(FTP*3600)*100); }
  return a.re ? Math.round(a.re) : Math.round(a.dur/3600*70);
}
function calcNP(a) { return a.np||(a.avg_watts?Math.round(a.avg_watts*1.05):null); }
function calcIF(a) { if(a.if_val) return parseFloat(a.if_val.toFixed(2)); var np=calcNP(a); return np?parseFloat((np/FTP).toFixed(2)):null; }
function calcVI(a) { var np=calcNP(a); return (np&&a.avg_watts)?parseFloat((np/a.avg_watts).toFixed(3)):null; }
function calcEF(a) { var np=calcNP(a); return (np&&a.hr)?parseFloat((np/a.hr).toFixed(3)):null; }

/* PMC: CTL = EMA 42gg dei TSS giornalieri, ATL = EMA 7gg.
   TSB = CTL - ATL del giorno PRECEDENTE (forma all'inizio della giornata,
   prima che il TSS di oggi venga "assorbito"). */
function computePMC() {
  var sorted = [].concat(activities).sort(function(a,b){return a.date.localeCompare(b.date);});
  if (!sorted.length) return {ctl:0,atl:0,tsb:0,history:[]};
  var start=new Date(sorted[0].date), end=new Date();
  var ctl=0,atl=0,pc=0,pa=0,history=[];
  for (var d=new Date(start);d<=end;d.setDate(d.getDate()+1)) {
    var ds=dateKey(d);
    var tss=activities.filter(function(a){return a.date===ds;}).reduce(function(s,a){return s+calcTSS(a);},0);
    var tsb=parseFloat((pc-pa).toFixed(1));
    ctl=parseFloat((ctl+(tss-ctl)/42).toFixed(2));
    atl=parseFloat((atl+(tss-atl)/7).toFixed(2));
    history.push({date:ds,ctl:parseFloat(ctl.toFixed(1)),atl:parseFloat(atl.toFixed(1)),tsb:tsb,tss:tss});
    pc=ctl; pa=atl;
  }
  return {ctl:Math.round(ctl),atl:Math.round(atl),tsb:Math.round(pc-pa),history:history};
}

function weekStats(wb) {
  wb = wb||0;
  var now=new Date(), mon=new Date(now);
  mon.setDate(now.getDate()-now.getDay()+1-wb*7); mon.setHours(0,0,0,0);
  var sun=new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59);
  var acts=activities.filter(function(a){var d=new Date(a.date);return d>=mon&&d<=sun;});
  return {
    tss:acts.reduce(function(s,a){return s+calcTSS(a);},0),
    km:acts.reduce(function(s,a){return s+(a.dist||0);},0),
    dur:acts.reduce(function(s,a){return s+(a.dur||0);},0)
  };
}
