# Gestione Commesse2

La nuova sezione `/commesse2` affianca Gestione Commesse nel menu desktop e mobile. Usa gli stessi dati reali: è uno spazio di familiarizzazione con la nuova navigazione, non una copia del database.

- Overview immediata con ricavi, costi, margine e percentuale per commessa, totali sui filtri, alert e silenziamento.
- Selettore rapido e pulsante Apri dashboard per ogni cantiere. La dashboard esistente mantiene i contenuti.
- Filtri per nome, tipo, stato e date; categorie budget/actual e conteggi attività espandibili.
- Una sola scheda `/commesse/[id]`, aggiornata anche per gli accessi dalla sezione originale: Dati Commessa, Budget, Listino.
- Listino sempre raggiungibile, anche quando disattivato. Il budget conserva la fonte manuale sulle commesse esistenti; il passaggio al totale dei prezzi di listino è esplicito e reversibile senza perdere l'importo manuale.
- Moduli facoltativi Clienti e Libretto immobile attivabili da Moduli commessa. Disattivare un modulo non cancella i dati.
- Pratiche con più intestatari/referenti testuali e più unità; richieste, scelte capitolato, stati, ambiti, responsabili e data obiettivo. Le date non generano automaticamente nuove scadenze Calendar.
- Libretto con schede tecniche per ambito/edificio/unità. Categoria e ambito sono compilabili; non impongono una tassonomia normativa.
- Ogni salvataggio di scheda conserva una revisione con autore e data. Nessuna eliminazione delle schede; chiusura/superamento tramite stato.
- Documenti su Drive, revisioni immutabili e collegamento dello stesso documento a più schede. Caricamento fino a 4 MB per richiesta; PDF, JPG/PNG/WebP, DOCX/XLSX, ZIP, DWG/DXF.
- Gli utenti attivi interni possono consultare e aggiornare i fascicoli secondo il modello di accesso corrente. Non è un portale cliente e non introduce condivisione esterna. Vendite e approvazione acconti mantengono l'accesso admin elevato esistente.

## Persistenza e compatibilità

Migrazione additiva `20261028120000_job_order_dossiers`: tre impostazioni sulla commessa e tabelle fascicoli/documenti. Nessuna trasformazione o cancellazione dei dati preesistenti. Le unità commerciali vengono riutilizzate, le pratiche sopravvivono all'annullamento di una vendita, i documenti possono essere collegati senza duplicare i file.

I salvataggi di Dati, Budget e Moduli aggiornano soltanto i propri campi, con controllo di versione per rifiutare una modifica concorrente. La nuova overview carica le sintesi in blocco e riusa le regole economiche della dashboard; non scarica una dashboard completa per ogni riga.

## Verifiche

- `npm run build`
- `npm run test:commesse`: migrazioni e integrazione in schema PostgreSQL temporaneo, senza modificare dati applicativi reali.
- `npm run test:sales`: regressione del ciclo vendite/scadenze/acconti.
- `npx tsx scripts/test-job-order-browser.ts`: verifica browser con account e schema temporanei; richiede build completata, browser locale e credenziali Drive. I file di prova sono eliminati da Drive al termine.

Non eseguire due `prisma migrate deploy` contemporaneamente anche su schemi diversi dello stesso database, perché condividono l'advisory lock. Non avviare `next build` mentre il test browser usa la build locale.
