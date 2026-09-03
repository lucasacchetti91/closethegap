# index.html — le quattro modifiche

Tutto il resto di `index.html` resta com'e'. Riferimento: mockup 3a/3b (mobile)
e 4a/4b (desktop).

---

## 1. Nel `<head>`, subito dopo la riga di `css/style.css`

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/redesign.css">
```

Se avevi installato la patch precedente, `css/mobile.css` e
`js/mobile-ui.js` vanno rimossi: questi due file li sostituiscono.

---

## 2. Le due `.kpi-row` diventano una card sola

**Sostituisci entrambi questi blocchi**, dentro `<div class="left-panel">`:

```html
<div class="kpi-row">
  <div class="kpi">…CTL…</div>
  <div class="kpi">…ATL…</div>
  <div class="kpi">…TSB…</div>
</div>
<div class="kpi-row">
  <div class="kpi">…FTP…</div>
  <div class="kpi">…LTHR…</div>
  <div class="kpi">…Obiettivo…</div>
</div>
```

**con questo:**

```html
<div class="hero-tsb">
  <div class="hero-head">
    <span class="gc-lbl">TSB · Forma</span>
    <span class="hero-flag" id="tsb-flag">—</span>
  </div>
  <div class="hero-main">
    <div class="kv" id="k-tsb">—</div>
    <p class="hero-note" id="tsb-note"></p>
  </div>
  <div class="hero-row">
    <div><span class="gc-lbl">CTL</span><span class="kv-s kv-up" id="k-ctl">—</span></div>
    <div><span class="gc-lbl">ATL</span><span class="kv-s kv-dn" id="k-atl">—</span></div>
    <div><span class="gc-lbl">FTP</span><span class="kv-s kv-acc" id="k-ftp">—</span></div>
    <div><span class="gc-lbl">A target</span><span class="kv-s kv-pur" id="hero-gap">—</span></div>
    <div><span class="gc-lbl">Gara</span><span class="kv-s" id="hero-race">—</span></div>
  </div>
</div>
```

Gli `id` sono gli stessi che `home.js` usa gia': `#k-tsb`, `#k-ctl`,
`#k-atl`, `#k-ftp`. Il colore del numero grande arriva dalla classe
`kv-up`/`kv-dn`/`kv-wa` che `home.js` scrive da se'; `ui-redesign.js`
riempie solo lo stato, la frase, il gap e la data gara.

---

## 3. Chip filtro in cima alla pagina Analisi (opzionale)

Sopra il primo `<div class="card">` di `#page-analytics`:

```html
<div class="chips">
  <button class="chip active">Potenza</button>
  <button class="chip">Forma</button>
  <button class="chip">Volume</button>
  <button class="chip">Modelli</button>
  <button class="chip">Recupero</button>
  <span class="chip chip-range">90 gg ▾</span>
</div>
```

Cosi' sono solo visuali. Per farli filtrare davvero serve un attributo
tipo `data-fam="potenza"` su ogni `.card` della pagina piu' una
funzione che nasconde le altre famiglie — vedi README, "Restano da fare".

---

## 4. Subito prima di `</body>`

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
<script src="js/ui-redesign.js"></script>
```
