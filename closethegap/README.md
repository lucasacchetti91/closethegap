# Restyle Close the Gap — mobile + desktop

Corrisponde ai mockup 3a/3b (telefono) e 4a/4b (desktop). Due file nuovi,
quattro modifiche a `index.html`. Nessun file esistente viene riscritto:
`style.css`, `home.js` e gli altri moduli restano intatti.

## File da copiare

| Da qui | A |
| --- | --- |
| `css/redesign.css` | `closethegap/css/redesign.css` |
| `js/ui-redesign.js` | `closethegap/js/ui-redesign.js` |

Se avevi installato la patch precedente, cancella `css/mobile.css` e
`js/mobile-ui.js`: questi due li sostituiscono.

## Modifiche a index.html

Quattro, tutte in `index-snippets.md`: i `<link>` nel `<head>`, le due
`.kpi-row` che diventano la card TSB, i chip sopra Analisi (opzionali),
la `<nav class="tabbar">` con lo script prima di `</body>`.

## Le tre regole del sistema

1. **Il TSB e' il numero piu' grande della pagina.** 3.4rem su telefono,
   3.9rem su desktop. CTL, ATL, FTP, gap e data gara sono la riga di
   supporto sotto la linea.
2. **L'allenamento di oggi e' l'unico blocco a fondo giallo.** E' l'unica
   azione della schermata: l'occhio ci va senza bisogno di un titolo.
   Nessun altro elemento usa `--acc` come fondo pieno.
3. **Etichette e numeri in JetBrains Mono, prosa e nomi in Archivo.**
   Le cifre sono tabulari, quindi le colonne di numeri restano allineate.

## Cosa cambia, in dettaglio

- **Tipografia** — via il Segoe UI di sistema.
- **Gerarchia** — sei card gemelle diventate una card eroe piu' una riga.
- **Settimana** — sette barre giornaliere (altezza = TSS, verde svolto,
  giallo oggi, viola gara) al posto delle celle col pallino. Il click
  apre il giorno come prima, via `selectDay()`.
- **Sidebar** — le emoji sono nascoste via CSS e sostituite da glifi
  geometrici; la label "Dati" diventa un separatore. Nessun HTML toccato.
- **Desktop** — `.home-split` da 1fr/1fr a 1.35fr/1fr, `.g3` con minimo
  240px: mai tre grafici stretti per riga.
- **Mobile** — topbar `sticky`, tab bar fissa a cinque voci, grafici a
  210px minimi, best efforts in carosello orizzontale, modale a foglio
  dal basso con input a 16px (iOS non zooma piu').
- **Saluto** — su "Oggi" il titolo diventa "Bentornato, Luca"
  (`USER_NAME` in cima a `ui-redesign.js`).

## Restano da fare (fuori da questi due file)

- **Font degli assi** dei grafici: stanno in `js/charts.js`, oggi a
  `size:8`. Su mobile vanno a 10-11, altrimenti le date del PMC restano
  illeggibili qualunque cosa faccia il CSS.
- **Chip filtro funzionanti**: servono un `data-fam` su ogni `.card` di
  `#page-analytics` e una funzione che nasconda le famiglie non attive.
  Nei mockup 4b i chip filtrano; nello snippet sono solo visuali.
- **`GOAL`** in `ui-redesign.js` e' scritto a mano (360W / 2026-09-19).
  Se vuoi che segua la gara A, va letto da `races.js`.
- **`--acc`** in cima a `redesign.css`: una riga per cambiare il giallo
  in tutta l'app, mobile e desktop insieme.
