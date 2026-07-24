# Close the Gap v4.0 — Rewrite modulare

## 1. Bug fix (build precedente)
Un solo bug ha causato entrambi gli errori riportati:

```js
borderColor:var(--acc),   // riga 617 della vecchia build
```

`var(--acc)` è sintassi CSS scritta per errore dentro al JavaScript. Il parser
interpreta `var` come keyword di dichiarazione, quindi va in `SyntaxError` e
**blocca il parsing dell'intero `<script>`** — di conseguenza nessuna
funzione veniva definita, incluso `syncIntervals` (che esisteva già più
sotto ma non veniva mai caricata). Fix: sostituito con la stringa `'#e8ff47'`
(vedi `js/home.js`).

## 2. Struttura dei file

```
index.html          markup + ordine di caricamento script
css/style.css        tutti gli stili (invariati)
js/config.js          FTP/LTHR/HR_MAX/HR_REST, colori, ICU_WORKER, dati RAW attività, best efforts
js/metrics.js         calcTSS/NP/IF/VI/EF, PMC (CTL/ATL/TSB), statistiche settimanali
js/models.js          Critical Power, PDM, W'bal, Banister/TRIMP, Decoupling
js/charts.js          wrapper Chart.js + tutti i render della tab Analisi
js/home.js            tab Oggi (KPI, mini-PMC, scheda allenamento, week strip)
js/plan.js            piano 11 settimane, render tab Piano, adattamento automatico
js/calendar.js        tab Calendario
js/activities.js      tab Attività (tabella filtrabile)
js/sync.js            sync Strava/Intervals.icu, import CSV Garmin, modale "+ Attività"
js/app.js             routing tra tab, service worker, bootstrap (va caricato per ultimo)
```

Nessun build step: sono `<script>` classici in ordine, condividono lo stesso
scope globale (var/function, coerente con la build precedente per
compatibilità). Deploy su Cloudflare Pages da GitHub funziona identico a
prima — basta pushare la cartella così com'è.

## 3. Modelli aggiornati

### Critical Power (CP/W')
**Corretto un bug di modellazione**: il fit veniva fatto su tutta la curva
fino a 1h, il che sottostima CP (gli sforzi lunghi sono contaminati da
pacing/decoupling aerobico). Ora il fit lineare usa solo gli sforzi nel
range standard 3'-20' (protocollo classico Monod-Scherrer).
Risultato: **CP passa da 288W a 335W**, molto più coerente con la tua FTP
loggata di 340W.

### PDM (Power Duration Model)
Estende CP/W' con **Pmax** (potenza neuromuscolare di picco, dal miglior
sforzo ≤15s) per modellare meglio la parte anaerobica della curva. FTP
stimata come blend Morton(CP)/95% del 20min, invariato nella logica ma ora
basato sul CP corretto.

### EF (Efficiency Factor) e VI (Variability Index)
Logica invariata (NP/HR e NP/potenza media), estratta in funzioni riusabili
(`efSeries`, `viSeries`) in `models.js`.

### W'bal — modello differenziale di Skiba
**Vera novità**: implementata la formula reale di Skiba (2012) —
consumo lineare sopra CP, recupero esponenziale con costante di tempo
variabile (`tau = 546·e^(-0.01·DCP) + 316`) sotto CP. Questo modello
**richiede lo stream secondo-per-secondo** di una singola uscita, che non
è disponibile nei riepiloghi Garmin/Intervals.icu.

Ho usato il tuo connector Strava per scaricare gli stream (potenza + FC,
risoluzione ridotta per contenere il costo) di 4 uscite chiave e calcolato
i valori reali, marcati con `stream_wbal_min_kj` in `config.js`:

| Uscita | W' minimo raggiunto | W' fine uscita |
|---|---|---|
| GF Biella | 0 kJ (esaurito) | 7.45 kJ |
| Colma di Varallo | 0 kJ (esaurito) | 8.49 kJ |
| Nove Colli | 0 kJ (esaurito) | 1.09 kJ |
| Strade Bianche | 0 kJ (esaurito) | 1.10 kJ |

Per tutte le altre attività il grafico usa un'**approssimazione a livello
di sessione** (basata su TSS), meno precisa ma sempre disponibile offline.
Nel grafico i punti reali sono evidenziati in giallo con pallino pieno.

**Limite noto**: la risoluzione usata (≈300 campioni per uscita, quindi
~30-45s tra un punto e l'altro su gare di 3-4h) è più grossolana della
risoluzione al secondo che userebbe Golden Cheetah — questo tende ad
amplificare la profondità di deplezione stimata. Per un calcolo davvero
preciso servirebbe lo stream a piena risoluzione (fattibile ma più
costoso in termini di chiamate/contesto).

**Per rendere questo automatico su ogni sync futuro**: serve un Cloudflare
Worker con OAuth Strava (stesso pattern di `ICU_WORKER` per Intervals.icu)
che esponga uno endpoint `/streams?activity_id=...`. Il codice in
`models.js` (`computeWbalFromStream`) è già pronto per essere collegato:
basta impostare `STRAVA_WORKER` in `config.js` e chiamarlo da `sync.js`.
Se vuoi, posso aiutarti a costruire quel worker in una prossima sessione.

### Decoupling aerobico (Pw:Hr)
Stessa storia di W'bal: implementata la versione **reale** (split
dell'uscita a metà tempo, rapporto potenza/FC primo vs secondo tempo) per
le 4 uscite con stream, tutte le altre restano sull'approssimazione
precedente (VI + durata).

| Uscita | Decoupling reale |
|---|---|
| Colma di Varallo | **+9.0%** — coerente con l'IF 0.82 già segnalato come sforzo molto duro |
| Nove Colli | +2.9% |
| GF Biella | -3.6% (nessun drift, pacing negativo) |
| Strade Bianche | -17.6% (negative split marcato — verifica se plausibile, vedi nota sotto) |

**Nota su Strade Bianche**: un decoupling molto negativo di solito indica
che la seconda metà è stata affrontata a potenza più alta ma con FC
proporzionalmente più bassa (es. gruppo/scia nel finale). Vale la pena
controllare a occhio lo split reale su Strava se il numero sembra
sorprendente — con soli 4 esempi non c'è ancora una base per giudicare se
sia rumore di misura o un pattern reale.

### Banister Impulse-Response — ora basato su TRIMP (FC)
Come richiesto, è **indipendente** dal PMC (che usa TSS/potenza): calcola
un TRIMP giornaliero dalla frequenza cardiaca con la formula originale di
Banister (pesatura esponenziale sulla riserva cardiaca, costanti 0.64/1.92
per uomini), poi applica lo stesso schema EMA 42gg/7gg ma su questa
metrica diversa. Aggiunto un campo **HR riposo** (default 48 bpm,
modificabile) nell'header della tab Analisi, necessario per calcolare la
riserva cardiaca. I due modelli (PMC su TSS, Banister su TRIMP) possono
ora divergere leggermente — se lo fanno in modo consistente è un segnale
utile (es. potenza in salita ma FC che non segue, o viceversa).

## 4. Prossimi passi possibili
- Costruire il Cloudflare Worker OAuth per Strava e rendere W'bal/Decoupling
  reali automatici su ogni sync, non solo sulle 4 uscite pre-calcolate.
- Ricalcolare `bestEfforts` dinamicamente dagli stream reali (best mean
  power per durata) invece di tenerli hardcoded in `config.js`.
- Tarare le costanti k1/k2 del modello Banister su dati di performance
  reali, se disponibili (es. test FTP ripetuti nel tempo).
