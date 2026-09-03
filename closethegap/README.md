# Patch mobile — Close the Gap

Corrisponde ai mockup 2a e 2b. Due file nuovi, tre modifiche a `index.html`.
Nessun file esistente viene riscritto.

## File da copiare

| Da qui | A |
| --- | --- |
| `css/mobile.css` | `closethegap/css/mobile.css` |
| `js/mobile-ui.js` | `closethegap/js/mobile-ui.js` |

## Modifiche a index.html

Sono tre, tutte in `index-snippets.md`: i due `<link>` dei font + il CSS
nel `<head>`, la seconda `.kpi-row` che diventa una card obiettivo, la
`<nav class="tabbar">` prima di `</body>` con lo script `mobile-ui.js`.

## Cosa cambia, in ordine di peso

1. **Tipografia** — via il Segoe UI di sistema: Archivo per il testo,
   JetBrains Mono per numeri ed etichette, con cifre tabulari.
2. **Gerarchia** — la riga CTL/ATL/TSB passa a due colonne piu il TSB a
   piena larghezza (3.2rem). E' il numero che decide la giornata.
3. **Obiettivo** — FTP, target e gap in una riga: `347 → 360W`, `−13W`,
   `16 GG · 19 SET`. Il countdown e calcolato, non scritto a mano.
4. **Navigazione** — topbar `sticky` (oggi scorre via) e tab bar fissa a
   cinque voci. Il drawer resta per sync, import CSV e diagnostica.
5. **Grafici** — 210px di altezza minima su mobile, best efforts in
   carosello orizzontale, i due blocchi di `.g2` sempre impilati.
6. **Settimana** — "mancano 76" accanto all'etichetta invece che sotto la
   barra: tre righe risparmiate.
7. **Form** — modale a foglio dal basso, input a 16px (iOS non zooma piu),
   target di tocco a 44px.

## Restano da fare (fuori dal CSS)

- I font degli assi dei grafici stanno in `js/charts.js`, oggi a `size:8`.
  Su mobile vanno a 10-11, altrimenti le date del PMC restano illeggibili.
- `GOAL` in `js/mobile-ui.js` e scritto a mano (360W / 2026-09-19). Se
  vuoi che segua la gara A, va letto da `races.js`.
- L'accento `--acc` e in cima a `mobile.css`: una riga per cambiare il
  giallo in tutta l'app.
