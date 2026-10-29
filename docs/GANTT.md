# Pianificazione Gantt delle commesse

La scheda commessa, nel tab **Dati Commessa**, contiene **Pianificazione Gantt**.
La card dei dati usa una griglia compatta: sei colonne su desktop, quattro su tablet,
una o due su mobile, con controlli più alti sui dispositivi piccoli. Indirizzo e descrizione
sono affiancati sui display ampi; la descrizione resta ridimensionabile.
L'editor è una tabella: nomi e aggiunta delle righe nella colonna sinistra, asse temporale
scorribile nella colonna destra. Le righe rappresentano le sezioni già salvate, senza
conversioni dei dati. Trascinando sul calendario si crea una barra; scegliendo lo strumento
milestone si inserisce un traguardo sulla data. Barre e milestone si possono spostare,
e i bordi delle barre modificano la durata. Gli elementi selezionati aprono i dettagli
per titolo, descrizione, stato e date. È disponibile anche l'inserimento tramite date
per chi usa la tastiera. Le attività sovrapposte occupano corsie diverse nella stessa riga.
Ogni riga ha un colore personalizzabile, salvato nel JSON del piano (facoltativo per i
piani precedenti). Barre e milestone usano lo stesso colore. Con lo strumento milestone
si può cliccare direttamente sulla barra per aggiungere il traguardo alla sua riga.
Il salvataggio è separato dai dati anagrafici e dal budget; le modifiche concorrenti vengono
rilevate tramite versione, per evitare sovrascritture involontarie.

La pagina autenticata `/dashboard002` è un'anteprima senza collegamenti nel menu e con
indicizzazione disabilitata. Usa gli stessi componenti della dashboard, aggiungendo gli
accordion Meteo e Gantt. La pagina `/dashboard` mantiene il comportamento precedente.

Il riepilogo Gantt include le commesse SITE e OTHER. La barra di ciascuna commessa va
dalla prima all'ultima data pianificata, comprese le milestone. Espandendo la riga si
vedono sezioni e singole voci sullo stesso asse temporale. Sono visibili solo le commesse
con almeno un'attività o milestone che interseca il periodo effettivamente visibile:
un intervallo vuoto tra due attività non basta a includere una commessa. Lo scorrimento
orizzontale aggiorna le righe incluse; la finestra iniziale è oggi meno 15 giorni / oggi
più 3 mesi di calendario. La scala si comprime o dilata con pulsanti e cursore, conservando
il centro del periodo. Oggi ripristina la finestra iniziale, Tutto il piano adatta la scala
all'intera pianificazione. I nomi delle righe restano fissi mentre si scorre il calendario.
La dashboard espansa mostra una sola riga per sezione/attività, con tutte le barre e le
milestone allineate nelle stesse corsie; non duplica sezioni, attività e traguardi in righe
separate. I dettagli sono disponibili sui singoli elementi e nel collegamento Modifica.
Le etichette dell'asse hanno almeno 90 pixel di distanza; la scala sceglie intervalli di
giorni, mesi o anni e nasconde le etichette parziali ai bordi del periodo visibile.
Non si generano date presunte né si modificano le date anagrafiche della commessa.

## Esportazione PDF

Il pulsante Esporta PDF nella scheda produce il piano completo oppure il periodo visibile.
Il POST autenticato `/api/commesse/[id]/gantt/pdf` valida il piano visualizzato senza
salvarlo: se differisce dal piano persistito, il PDF riporta Bozza non salvata. Il confronto
è strutturale, indipendente dall'ordine delle chiavi JSON di PostgreSQL.
Nella dashboard il pulsante esporta le sole commesse pianificate nel periodo visibile,
tramite GET autenticato `/api/gantt/pdf?start=...&end=...`.

L'output vettoriale è A3 orizzontale, conserva colori e milestone sulla stessa riga e include
note e dettagli dei traguardi. I periodi lunghi sono divisi in finestre di massimo sei mesi;
righe, corsie sovrapposte e note proseguono sulle pagine successive. Ogni pagina riporta
commessa, periodo e numero di pagina. L'esportazione è limitata a 100 pagine per richiesta.
Non modifica date, versioni o dati delle commesse. Nessuna nuova migrazione necessaria.

## Skill portabile e importazione da testo

In Dati Commessa > Pianificazione Gantt > Importa da AI è possibile copiare le istruzioni
da portare nel proprio assistente AI, oppure scaricare il file Markdown e il pacchetto ZIP.
Non viene chiamato alcun servizio AI da GiGEST e non occorrono chiavi API.

La skill canonica è `public/skills/gigest-gantt/SKILL.md`, accompagnata da `esempio.txt`.
Il pacchetto `public/skills/gigest-gantt.zip` contiene entrambi nella cartella gigest-gantt;
rigenerarlo quando cambia la skill. Una copia è installata nelle skill locali di Codex.
La skill chiede di chiarire anno, data iniziale, calendario e durate mancanti; eventuali
ipotesi esplicite sono riportate come NOTA nel testo di scambio.

Il formato testo GIGEST GANTT 1 usa una riga per comando, con campi separati da `|`:

- `ATTIVITA | Nome | Inizio | Fine | #RRGGBB | Descrizione facoltativa`
- `MILESTONE | Nome attività | Nome traguardo | Data | Descrizione facoltativa`
- `INTERMEDIA | Nome attività | Nome verifica | Data | Descrizione facoltativa`
- `TITOLO | ...`, `CALENDARIO | ...`, `NOTA | ...` per il contesto.

Sono accettate date complete gg/mm/aaaa e aaaa-mm-gg, righe vuote, ATTIVITÀ accentato,
un'eventuale recinzione Markdown e un BOM iniziale. Le milestone sono risolte per nome
dell'attività, anche se precedono le righe ATTIVITA. I nomi sono confrontati senza distinzione
di maiuscole e accenti. Ripetere lo stesso nome aggiunge barre nella medesima riga.
Non vengono eseguiti comandi, interpretate istruzioni libere o modificati dati dal parser.

La verifica presenta una tabella con date, colori e milestone, note e avvisi. Richiede
la conferma di revisione e permette di aggiungere righe (default) o sostituire il piano
nell'editor. Applica all'editor cambia solo la bozza locale; Salva pianificazione conserva
i controlli di versione esistenti. Titolo, calendario e ipotesi vengono mantenuti nella
descrizione della prima riga, quindi sono disponibili anche dopo salvataggio e nei PDF.
I limiti sono 1 MB di testo, 50 righe e 500 elementi; errori di formato riportano la riga.

I dati sono salvati nella tabella `JobOrderSchedule`, collegata alla commessa.
La migrazione `20261029100000_job_order_gantt` è additiva.

## Verifiche

- `npm run build`
- `npm run test:gantt-pdf`: generazione di PDF completi, bozze, periodi selezionati,
  piani pluriennali, corsie sovrapposte e note lunghe; verifica visiva in `tmp/pdfs`.
- `npm run test:gantt-text`: esempio ristrutturazione settembre-gennaio, formati data,
  milestone nella riga, colori, note, errori e limiti del formato testo.
- `npm run test:gantt`: validazione date, intervalli, milestone, conflitti concorrenti e
  persistenza in uno schema PostgreSQL temporaneo isolato.
- `TEST_GANTT_UI=1` abilita anche le verifiche browser sul build locale: editor,
  disegno, trascinamento, ridimensionamento, annullamento del gesto, riordino, salvataggio,
  filtri legati al periodo, scorrimento, zoom, meteo, accessi e viste desktop/mobile.
  La verifica controlla che la dashboard principale non contenga i nuovi accordion.
