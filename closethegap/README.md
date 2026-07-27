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

## 3bis. v2 — Metriche native da Intervals.icu (invece di ricalcolarle)

Intervals.icu calcola già internamente quasi tutti i modelli sopra, e li
espone come campi delle attività o dentro i record di wellness. Invece di
ricostruire tutto da stream grezzi (rumoroso, limitato dalla risoluzione),
ora si leggono direttamente:

| Metrica | Campo Intervals.icu | Dove |
|---|---|---|
| Decoupling reale (Pw:Hr) | `power_hr` / `icu_power_hr` | per attività, via `/activities?fields=...` |
| W'bal minimo raggiunto | `max_wbal_depletion` / `icu_max_wbal_depletion` | idem |
| Variability Index | `variability_index` / `icu_variability_index` | idem |
| Efficiency Factor | `efficiency` / `icu_efficiency` | idem |
| TRIMP (Banister) | `trimp` / `icu_trimp` | idem |
| CP / W' / Pmax (Morton 3-param) | `sportInfo[].eftp/wPrime/pMax` | dentro i record di `/wellness` |

**Nota onestà sui nomi dei campi**: la documentazione pubblica conferma
questi nomi come identificatori di filtro (`ActivityFilter.field_id`), ma
non è certo al 100% che il JSON di risposta di `/activities?fields=...`
usi esattamente questi nomi invece della variante `icu_`-prefissata (come
`icu_training_load`). Per questo `js/icu-native.js` richiede **entrambe le
varianti** e sceglie quella che esiste. **Dopo il primo sync reale**, apri
la console del browser: viene loggato `icuNativeLastRawSample` con
un'attività grezza — se vuoi, incollamelo così ripulisco il codice dai
nomi che non servono davvero.

### Nuovi file
- `functions/api/[[path]].js` — esteso per proxare anche gli endpoint
  "per singola attività" di Intervals.icu (`/activity/{id}/streams`,
  `/power-vs-hr`, `/best-efforts`), che vivono sotto un path diverso da
  quelli scoperti sull'atleta. Solo GET permesso. L'API key può ora
  vivere in una variabile d'ambiente Cloudflare (`ICU_API_KEY`, Settings
  → Environment variables → aggiungi come **secret**) invece che in
  chiaro nel codice — se non la imposti continua a funzionare col valore
  hardcoded esistente come fallback, ma è consigliato migrare **quanto
  prima dato che la chiave API è visibile in chiaro nel file caricato**.
- `js/icu-native.js` — sincronizza le metriche native (bottone "🔬 Sync
  metriche avanzate ICU" nella tab Analisi) e le fonde nel dataset
  locale con lo stesso matching data+distanza già usato per Strava/Garmin.
  Espone anche `fetchICUActivityStreams()` e `fetchICUPowerVsHR()` per
  eventuali grafici di dettaglio su una singola uscita in futuro.

### Priorità nei grafici (dal più affidabile al meno)
1. **● nativo Intervals.icu** — calcolato da loro sullo stream reale
2. **○ stream Strava** — le 4 uscite pre-calcolate manualmente nella v1
3. **nessun simbolo** — approssimazione a livello di sessione (fallback
   per attività non ancora sincronizzate o senza dati sufficienti)

Testato in ambiente headless (jsdom) con risposte API simulate: il
merge, il fallback a 3 livelli e tutti i render funzionano senza errori.
Il test reale contro l'API vera va fatto dopo il deploy, premendo il
bottone "🔬 Sync metriche avanzate ICU" nella tab Analisi.

## 5. v3 — Generatore di piano + zone individualizzate

### Zone potenza e FC "vere" (come richiesto, sullo stile Intervals.icu)
Nuovo file `js/zones.js`:
- **Potenza**: Z1-Z4 restano % di CP (Coggan classico, funzionano bene
  sotto soglia), ma **Z5-Z7 sono ancorate a durate fisiologiche reali**
  usando il tuo W' e Pmax: confine Z5/Z6 = potenza sostenibile ~5min
  (CP+W'/300), Z6/Z7 = potenza sostenibile ~60s (CP+W'/60), cima Z7 =
  il tuo Pmax neuromuscolare reale. Due persone con la stessa CP ma W'
  diverso avranno zone anaerobiche diverse — corretto, perché la loro
  fisiologia è diversa.
- **FC**: LTHR può essere **stimata dai dati reali** (cerca lo sforzo
  continuativo più duro vicino soglia, 20-75min con IF≥0.78, e usa la
  sua FC media) invece di restare un numero fisso inserito una volta.
  Resta comunque modificabile a mano nell'header Analisi.
- `applyDataDrivenZones()` gira al bootstrap e dopo ogni sync ICU,
  aggiornando FTP/LTHR globali (e i campi nell'header) automaticamente
  — lo stesso comportamento dell'eFTP di Intervals.icu.

### Generatore di piano (non più un array statico)
Nuovo file `js/plan-generator.js`. Le settimane **passate** restano un
registro storico invariato; le settimane **future** (da oggi alla gara
obiettivo) sono generate da `generateFuturePlan()` usando:

1. **CP/W'/Pmax reali** per dimensionare ogni ripetuta (formula
   tempo-di-esaurimento `t = W'/(potenza-CP)`, non tabelle %FTP fisse)
2. **Ramp rate dimostrato**: guarda il tuo storico CTL e trova quanto
   incremento settimanale hai già retto senza far crollare il TSB sotto
   -28 nei 14gg successivi (logica ispirata a Gabbett/ACWR), clampato
   3-8 CTL/settimana per sicurezza
3. **Polarizzazione reale** (Seiler 80/20): calcola quanto tempo hai
   passato davvero in bassa/alta intensità negli ultimi 42gg: se sei
   sbilanciato verso l'alta intensità, riduce le sessioni qualità quella
   settimana
4. **Profilo delle gare analizzate**: usa durata/decoupling medi delle 4
   gare con stream reali per calibrare una sessione "specifica gara"
   nella fase di Picco Forma (principio di specificità)
5. **Fasi di periodizzazione** (Costruzione → Picco Forma → Affilatura →
   Tapering Finale) in base alle settimane rimanenti alla data obiettivo

`adaptPlan()` ora chiama `makePlan()` per intero (rigenerazione vera),
non più +/-10-20% su un piano fisso. La tab Piano mostra in cima un
pannello con tutti i numeri usati per la generazione (CP, W', ramp rate,
polarizzazione, profilo gare) — trasparente, non è una scatola nera.

**Testato** in ambiente headless con lo storico reale delle 280 attività:
59 sessioni generate, nessuna data duplicata, nessun NaN, la gara del 19
settembre resta sempre l'evento fisso finale corretto.

### Onestà sui limiti
- Il ramp rate "dimostrato" usa una euristica semplice (percentile 75 dei
  delta CTL settimanali "sicuri"), non un vero modello ACWR con acute:
  chronic ratio giorno per giorno - è un'approssimazione ragionevole, non
  letteratura clinica applicata pedissequamente.
- Il "profilo gara" usa la media delle 4 gare già analizzate con stream
  Strava/ICU nativi - se in futuro sincronizzi più gare con dati nativi,
  il profilo si affina automaticamente.
- La sessione Z2 lunga del weekend e la sessione qualità del martedì/
  giovedì seguono un microciclo settimanale fisso (Friel-style) - non
  varia la struttura settimanale in base al tuo calendario lavorativo o
  preferenze di giorni liberi, che non ho.

## 6. Prossimi passi possibili
- Costruire il Cloudflare Worker OAuth per Strava e rendere W'bal/Decoupling
  reali automatici su ogni sync, non solo sulle 4 uscite pre-calcolate.
- Ricalcolare `bestEfforts` dinamicamente dagli stream reali (best mean
  power per durata) invece di tenerli hardcoded in `config.js`.
- Tarare le costanti k1/k2 del modello Banister su dati di performance
  reali, se disponibili (es. test FTP ripetuti nel tempo).
