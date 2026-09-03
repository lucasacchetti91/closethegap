# index.html — le tre modifiche

Tutto il resto di `index.html` resta com'e'.

---

## 1. Nel `<head>`, subito dopo la riga di `css/style.css`

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/mobile.css">
```

---

## 2. La seconda `.kpi-row` (FTP / LTHR / Obiettivo) diventa una card sola

**Sostituisci questo blocco**, dentro `<div class="left-panel">`:

```html
<div class="kpi-row">
  <div class="kpi"><div class="kl">FTP</div><div class="kv kv-acc" id="k-ftp">340W</div><div class="ks">4.8 W/kg</div></div>
  <div class="kpi"><div class="kl">LTHR</div><div class="kv kv-acc">180</div><div class="ks">bpm soglia</div></div>
  <div class="kpi"><div class="kl">Obiettivo</div><div class="kv" style="color:var(--pur);">360W</div><div class="ks">19 set 2026</div></div>
</div>
```

**con questo:**

```html
<div class="goal-card">
  <div style="flex:1">
    <div class="gc-lbl">FTP → OBIETTIVO</div>
    <div class="gc-val"><span class="gc-now" id="k-ftp-now">340</span><span class="gc-arr">→</span><span class="gc-goal" id="gc-goal">360W</span></div>
    <div class="gc-lbl gc-lthr" id="gc-lthr"></div>
  </div>
  <div class="gc-right">
    <div class="gc-gap" id="gc-gap">—</div>
    <div class="gc-lbl gc-sub" id="gc-sub"></div>
  </div>
</div>
<div id="k-ftp" style="display:none"></div>
```

> Il `div` nascosto con `id="k-ftp"` serve solo perche' `home.js` scrive
> ancora la' dentro: cosi' non devi toccare `home.js`.

---

## 3. Subito prima di `</body>`

```html
<nav class="tabbar" id="tabbar">
  <button data-tab="home" class="active" onclick="goTab('home',this)">
    <svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v10h12V10"/></svg>
    Oggi
  </button>
  <button data-tab="plan" onclick="goTab('plan',this)">
    <svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
    Piano
  </button>
  <button data-tab="calendar" onclick="goTab('calendar',this)">
    <svg viewBox="0 0 24 24"><path d="M4 6h16v14H4z"/><path d="M4 10h16M9 4v4M15 4v4"/></svg>
    Calendario
  </button>
  <button data-tab="activities" onclick="goTab('activities',this)">
    <svg viewBox="0 0 24 24"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-2-7-4 2"/></svg>
    Attivita
  </button>
  <button data-tab="analytics" onclick="goTab('analytics',this)">
    <svg viewBox="0 0 24 24"><path d="M4 20V9M10 20V4M16 20v-7M22 20H3"/></svg>
    Analisi
  </button>
</nav>
```

E in fondo alla lista degli script, **dopo `js/app.js`**:

```html
<script src="js/mobile-ui.js"></script>
```
