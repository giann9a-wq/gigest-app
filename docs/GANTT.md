# Pianificazione Gantt delle commesse

La scheda commessa, nel tab **Dati Commessa**, contiene **Pianificazione Gantt**.
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

I dati sono salvati nella tabella `JobOrderSchedule`, collegata alla commessa.
La migrazione `20261029100000_job_order_gantt` è additiva.

## Verifiche

- `npm run build`
- `npm run test:gantt`: validazione date, intervalli, milestone, conflitti concorrenti e
  persistenza in uno schema PostgreSQL temporaneo isolato.
- `TEST_GANTT_UI=1` abilita anche le verifiche browser sul build locale: editor,
  disegno, trascinamento, ridimensionamento, annullamento del gesto, riordino, salvataggio,
  filtri legati al periodo, scorrimento, zoom, meteo, accessi e viste desktop/mobile.
  La verifica controlla che la dashboard principale non contenga i nuovi accordion.
