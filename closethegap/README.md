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

### Struttura settimanale (vincoli espliciti)
- **3-4 uscite a settimana** (3 nelle fasi Affilatura/Tapering, 4 in
  Costruzione/Picco Forma)
- **Sabato = uscita lunga del weekend** (o simulazione gara in Picco
  Forma): qui vanno i lavori più lunghi (soglia 1-2x12-18'), incorporati
  dentro il giro lungo Z2 — mai isolati a sé
- **Infrasettimanali (martedì/giovedì/domenica) sempre ≤2h**, solo
  formati corti: VO2max a ripetute brevi (3-5min, ci sta comodamente) o
  Z2 breve — mai ripetute lunghe di soglia
- Se la polarizzazione reale è sbilanciata, il martedì diventa Z2 invece
  di VO2max invece di saltare la seduta

Testato: su tutte le settimane generate, nessuna infrasettimanale sopra
i 120 minuti, sempre 3 o 4 uscite/settimana, il lavoro lungo sempre e
solo nell'uscita del sabato.

## 5bis. v4 — Libreria di allenamenti basata sulla letteratura

Nuovo file `js/workouts.js`. Prima il generatore conosceva due soli
schemi e li ripeteva; ora pesca da una libreria di **12 formati**,
ruotando con l'indice di settimana e filtrando per fase.

| Formato | Cosa fa | Livello di evidenza |
|---|---|---|
| **Rønnestad 30/15** (3x13x30s/15s) | Massimizza il tempo sopra il 90% VO2max | Buono, ma con critiche metodologiche reali (vedi sotto) |
| **Alternati "Bossi"** (5' con oscillazione ±) | Più tempo sopra 90% VO2max vs ripetuta piatta | Buono |
| **Fast-start VO2max** (90s duri poi hold) | Il VO2 sale prima e ci resta di più | Buono |
| **Over-Under** (3' sotto / 2' sopra soglia) | Tolleranza al lattato e ai cambi di ritmo | Consolidato in pratica |
| **Sweet Spot** (88-94% CP) | Alto stimolo aerobico, recupero rapido | Consolidato |
| **W' repeats** | Ripetute dimensionate per consumare il 60% della *tua* W' | Solido come principio (modello CP/W') |
| **Durabilità** (sforzi DOPO ~1410 kJ) | Tenere potenza da stanco | Filone recente, molto rilevante per gran fondo |
| **Forza-resistenza** (50-60 rpm) | Tensione muscolare | **Debole/contrastata** — usato con parsimonia |
| Lungo+soglia, Simulazione gara, Z2, Riposo | Base del volume | — |

### Onestà sull'evidenza
- **Rønnestad 30/15**: gli studi (2015 e repliche) mostrano più tempo
  sopra il 90% VO2max e miglioramenti superiori vs 4-5x5'. Ma le
  critiche sono legittime e documentate: nel confronto originale il
  gruppo 30/15 svolgeva **più lavoro totale** (≈29,5' vs 20'), quindi
  parte del vantaggio può venire dal volume e non dal formato; inoltre i
  soggetti arrivavano da un periodo ad alto volume, per cui parte
  dell'effetto potrebbe essere un effetto-taper. È un buon formato, non
  una bacchetta magica — per questo è **in rotazione con altri**, non
  l'unico.
- **Durabilità**: una revisione sistematica recente avverte che i kJ da
  soli sono una metrica di fatica incompleta, perché l'intensità del
  lavoro precedente conta molto (sforzi sopra CP affaticano con molti
  meno kJ). Qui i kJ sono usati come target pratico, consapevoli del
  limite.
- **Bassa cadenza**: l'ho incluso per varietà ma con una nota esplicita
  nella descrizione della sessione — l'evidenza è più debole degli altri.

### Correzione di un bug trovato in test
Il riscalamento del TSS settimanale non era limitato e poteva produrre
valori impossibili (uno Z2 di 75' a 131 TSS nell'ultima settimana, che
ha meno sessioni). Ora il fattore è **clampato a ±15%**: se il target
settimanale non è raggiungibile con la struttura data, resta non
raggiunto — la struttura viene prima del numero.

## 5ter. v5 — Persistenza, layout, e correzione bug nei grafici

### Persistenza locale + auto-sync (`js/storage.js`)
All'apertura l'app carica **istantaneamente** l'ultimo stato da
localStorage e disegna tutto, poi lancia il sync in background. Non devi
più premere niente. Se sei offline o il sync fallisce, continui a
lavorare sui dati in cache invece di trovare l'app vuota (testato).
Un indicatore discreto in topbar dice a quando risalgono i dati.
Il sync automatico non riparte se l'ultimo è più recente di 30 minuti,
per non sprecare chiamate a ogni reload. I bottoni manuali restano per
forzare un aggiornamento.

Non ho aggiunto un database perché **Intervals.icu è già il tuo
database**: duplicare la fonte di verità creerebbe problemi di
allineamento che oggi non hai. Il passo successivo sensato è Cloudflare
KV, ma solo quando servirà persistere qualcosa che *non* vive su
Intervals.icu — il candidato naturale sono i piani generati, che oggi
vengono sovrascritti a ogni rigenerazione.

### Layout
- **Home**: la colonna centrale (KPI, PMC, recenti) ora è larga `1fr` e
  quella di destra (allenamento di oggi + settimana) è fissa a 330px.
- **Box "Questa Settimana"**: ora mostra svolto/pianificato con barre di
  avanzamento (es. `TSS 82 / 370`, `mancano 288`), più ore e conteggio
  uscite. Nuova funzione `weekPlanned()` in `metrics.js`.
- **Piano**: nuova vista macrociclo in stile ATP di TrainingPeaks —
  banda delle fasi in alto, sotto una colonna per settimana con il TSS
  pianificato; per le settimane passate/corrente la barra piena mostra
  quanto è stato **davvero svolto** sovrapposto al pianificato. Il
  dettaglio sotto mostra **solo le settimane con giorni futuri**, con un
  toggle per rivelare le passate; i giorni già passati dentro la
  settimana corrente restano visibili ma sbiaditi (così non perdi il
  contesto di dove sei nella settimana).
- **Calendario**: celle da 82px a 124px, testo e pillole più grandi.

### I quattro bug nei grafici (tutti reali, uno serio)

**1. Curva Critical Power fino a 8000W.** Causa: il modello iperbolico
`CP + W'/t` veniva disegnato fino a t=5 secondi. Con il W' nativo di
Intervals.icu (38.000 J nei miei test) dà `338 + 38000/5 = 7938W`.
Il modello CP è valido solo nella finestra ~2-30 minuti: estrapolarlo a
5 secondi è matematicamente lecito ma fisiologicamente assurdo. Ora la
curva parte da 120s. **In più** ho aggiunto un controllo di
plausibilità: se il W' nativo predice per 1 minuto una potenza >25%
sopra il tuo miglior minuto reale, viene scartato e si usa il W'
stimato localmente (mantenendo il CP nativo, che è affidabile) — con
nota esplicita nella legenda del grafico.

**2. Best effort disegnati sulle durate sbagliate** (CP e PDM). I punti
erano un array di 11 valori allineato *per indice* a 15 etichette di
durata: il tuo 1min a 460W finiva sopra l'etichetta "30s". Ora entrambi
i grafici usano coordinate `{x,y}` reali su asse logaritmico.

**3. Distribuzione zone — il bug più serio, ed era concettuale.** Il
codice classificava **ogni uscita** in base alla sua potenza *media* e
sommava l'**intera durata** in quell'unica zona. Non era affatto una
distribuzione del tempo in zona: una gran fondo di 4h con media 234W
finiva 100% in Z2 anche se conteneva 40' sopra soglia. Ora si usano i
tempi per zona che Intervals.icu calcola sullo stream reale
(`icu_zone_times` / `icu_hr_zone_times`, aggiunti al sync). Se non
disponibili, il vecchio metodo resta come fallback ma **etichettato per
quello che è** ("stima per potenza media — non è il tempo reale in
zona"), senza spacciarlo per una cosa che non è.

**4. Scatterplot TSS vs IF con punti inventati.** Il codice faceva
`calcIF(a) || 0.65`: per ogni uscita **senza misuratore di potenza**
inventava un IF di 0.65 e disegnava il punto lo stesso, creando una
colonna verticale di dati fittizi. Ora entrano solo le uscite con IF
realmente calcolabile (14 su 30 nel dataset attuale). Corretti anche il
clipping degli assi, che tagliava fuori le uscite agli estremi, e il
tooltip, che indicizzava l'array delle attività anche per le linee di
riferimento.

## 5quater. v6 — Feed attività, wellness Garmin, proiezioni

### Home
Colonne centrale e destra ora **50/50** come richiesto.

### Attività — feed stile Strava (`js/activity-detail.js` + `activities.js`)
La tabella a 11 colonne (illeggibile su mobile, senza spazio per grafica)
è diventata un **feed scorribile di schede**. Ogni scheda mostra i dati
di riepilogo più i tag delle metriche native (Pw:Hr, VI, W' consumato);
espandendola compaiono:
- **Planimetria del percorso** in SVG, disegnata dalle coordinate GPS.
  È il tracciato vettoriale, non una mappa con sfondo cartografico:
  nessun provider esterno, nessuna chiave API, nessun costo, nessun
  tracciamento. Per una vista "minimal" basta; per lo sfondo vero
  servirebbe Mapbox/OSM.
- **Profilo altimetrico** con quote min/max.
- **Best effort** (5s → 20min) calcolati dallo stream di potenza con
  somme prefisse.

**Perché i dettagli si scaricano a richiesta**: gli stream pesano
centinaia di kB per uscita; scaricarli tutti a ogni apertura sarebbe
lento e sprecherebbe chiamate API. Vengono presi solo quando espandi una
scheda, e di quello che arriva si salva **solo il riassunto derivato**
(percorso ridotto a 180 punti, altimetria a 140, best effort) — ~9 kB
per attività, che stanno comodi in localStorage. Gli stream grezzi non
vengono mai persistiti.

### Wellness Garmin via Intervals.icu (`js/wellness.js`) — sì, ha molto senso
FC a riposo, HRV, sonno, readiness, stress e peso. **Il motivo per cui
vale la pena, e non è solo un cruscotto in più**: il PMC ragiona solo sul
carico che *metti dentro* (TSS), non su come stai *rispondendo*. Due
settimane con lo stesso TSB sono molto diverse se in una dormi 5h e
l'HRV è crollata.

Per questo i dati non restano decorativi: **entrano in `adaptPlan()`**.
Se emergono segnali concordi di recupero incompleto, la prossima
sessione dura viene alleggerita del 25% con nota esplicita.

Cautele deliberate:
- Non si reagisce **mai** al valore di un singolo giorno: si confronta
  sempre la media a 7 giorni con la baseline a 42 giorni. I dati HRV
  sono rumorosi e una giornata storta non significa nulla.
- Il "readiness" Garmin è un indice proprietario non validato
  indipendentemente — trattato come indizio, non come verdetto.
- Il peso, se disponibile, aggiorna automaticamente il W/kg.

### Proiezioni — "dove arrivo se seguo il piano"
Due grafici nuovi in Analisi:
1. **Proiezione FTP**: storico eFTP + regressione lineare fino al 19
   settembre, confrontata con la retta necessaria per i 360W. Dice a
   quanti W/settimana stai crescendo e quanti ne servirebbero.
2. **Proiezione forma al giorno gara**: CTL/TSB proiettati usando il TSS
   *pianificato*, con verdetto sulla finestra di forma (+5/+25).

**Un errore trovato e corretto mentre costruivo questo grafico**: la
prima versione stimava la FTP storica dal miglior NP di un'uscita ×0.95.
È sbagliato — l'NP di un lungo aerobico di 4h sta molto sotto la soglia,
e infatti il grafico dava "FTP oggi: 265W" contro i ~340W reali. Ora usa
l'**eFTP che Intervals.icu calcola dai tuoi sforzi reali**; se non è
disponibile non disegna nulla e lo dice, invece di mostrare una curva
falsa.

## 5quinquies. Fix — "Dettagli non disponibili: ICU streams HTTP 403"

**Causa: avevo esteso il proxy sbagliato.** Ci sono due proxy verso
Intervals.icu in questo progetto:

1. `functions/api/[[path]].js` — **Pages Function**, deployata con il
   sito su Cloudflare Pages, raggiungibile su same-origin `/api/...`
2. `closethegap-proxy.luca-sacchetti91.workers.dev` — **Worker
   standalone**, ed è quello che l'app chiama davvero (`ICU_WORKER` in
   `js/config.js`)

Avevo aggiunto il supporto agli endpoint `/activity/{id}/...` solo al
primo. Il Worker standalone aveva ancora la vecchia lista di endpoint
permessi e rispondeva 403 su `/activity/...`, che è esattamente la
chiamata che serve per mappa, altimetria e best effort.

### Doppia soluzione
**a) Codice aggiornato del Worker** in `worker/closethegap-proxy.js`.
Va incollato nel dashboard Cloudflare (Workers & Pages →
closethegap-proxy → Edit code → Deploy). Non è un file del repo GitHub:
il Worker vive fuori dal repo.

**b) Fallback automatico nel frontend** (`icuFetch` in
`js/icu-native.js`): tutte le chiamate passano ora da un helper che
prova il Worker e, se riceve 403/404, ritenta automaticamente sulla
Pages Function same-origin `/api/...` — che è già aggiornata e viene
deployata insieme al sito. Quindi **il feed funziona anche senza
toccare il Worker**; aggiornarlo resta consigliato per evitare la
chiamata doppia a ogni richiesta.

Testato simulando il Worker che risponde 403: il fallback scatta, e
mappa/altimetria/best effort vengono disegnati correttamente.

## 5sexies. Fix — sync rotto + mappa percorso assente

### Sync rotto: regressione mia, causata dal fallback
Il fallback `icuFetch` che avevo aggiunto per aggirare il 403 aveva un
difetto di progettazione: impostava un flag **globale e permanente**.
La sequenza era:

1. apri "Dettagli" → `/activity/...` → il Worker risponde 403
2. scatta il fallback e imposta `icuFallbackActive = true` per **tutto**
3. da quel momento anche `/wellness` e `/activities`, che il Worker
   gestisce benissimo, vengono dirottate su `/api/...`
4. Cloudflare Pages, per una rotta non gestita, restituisce `index.html`
   con **status 200** → `resp.ok` è vero → si riceve una pagina HTML →
   il successivo `.json()` esplode → sincronizzazione morta

Due correzioni:
- **Fallback per famiglia di endpoint**, non globale: se solo
  `/activity` va servito da `/api`, tutto il resto continua a usare il
  Worker.
- **Verifica che la risposta sia davvero JSON**: un 200 che restituisce
  HTML viene trattato come fallimento, con messaggio esplicito. Un 200
  falso è più insidioso di un 404 pulito, perché avvelena
  silenziosamente tutto il resto.

### Mappa del percorso assente
Davo per scontato che `latlng` fosse sempre un array di coppie
`[lat,lng]` in stile Strava. In realtà:
- Intervals.icu può restituire le coordinate in forme diverse (coppie,
  oggetti `{lat,lng}`, due stream separati `lat`/`lng`, array piatto);
- la risposta `streams` stessa può essere un array di `{type,data}`
  oppure un oggetto con chiavi per tipo — nel secondo caso il parser
  restituiva un oggetto vuoto **senza alcun errore**, e mappa e
  altimetria sparivano in silenzio;
- i tracciati contengono buchi GPS con valori `null`: **bastava un solo
  null** per rendere `NaN` il calcolo dei limiti della mappa e non
  disegnare nulla.

Ora `normalizeLatLng()` accetta tutte le forme e scarta i punti non
validi (null, coordinate fuori range, 0/0), `pickAltitude()` riconosce i
vari nomi dello stream di quota, e il parser degli stream gestisce
entrambi i formati di risposta. Se il percorso manca davvero, il
pannello mostra **quali stream sono arrivati**, così la causa è visibile
invece di essere un riquadro vuoto.

Testato su sei formati di coordinate diversi (coppie, oggetti, piatto,
stream separati, con buchi GPS, risposta a oggetto): la mappa viene
disegnata correttamente in tutti e sei.

## 6. Prossimi passi possibili
- Costruire il Cloudflare Worker OAuth per Strava e rendere W'bal/Decoupling
  reali automatici su ogni sync, non solo sulle 4 uscite pre-calcolate.
- Ricalcolare `bestEfforts` dinamicamente dagli stream reali (best mean
  power per durata) invece di tenerli hardcoded in `config.js`.
- Tarare le costanti k1/k2 del modello Banister su dati di performance
  reali, se disponibili (es. test FTP ripetuti nel tempo).
