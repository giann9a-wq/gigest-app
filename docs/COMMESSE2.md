# Gestione Commesse

La sezione `/commesse` è l'unico ingresso Gestione Commesse nel menu desktop e mobile. Gli accessi precedenti `/commesse2` e `/commesse/overview` rimandano a questa vista; la dashboard senza una commessa selezionata torna all'elenco.

- Overview compatta con ricavi, costi, margine e percentuale per commessa, alert e silenziamento. Nessun totale aggregato tra periodi diversi.
- Selettore rapido e pulsante Apri dashboard per ogni cantiere. La dashboard esistente mantiene i contenuti.
- Filtri per nome, tipo, stato, date e ordinamento raccolti sotto Filtra per; categorie budget/actual e conteggi attività espandibili.
- Una sola scheda `/commesse/[id]`, aggiornata anche per gli accessi dalla sezione originale: Dati Commessa, Budget, Listino.
- Listino sempre raggiungibile, anche quando disattivato. Il budget conserva la fonte manuale sulle commesse esistenti; il passaggio al totale dei prezzi di listino è esplicito e reversibile senza perdere l'importo manuale.
- Moduli facoltativi Clienti e Libretto immobile attivabili da Moduli commessa. Disattivare un modulo non cancella i dati.
- In Vendite si sceglie un cliente già presente nella commessa oppure si inseriscono nome e contatti di un nuovo cliente. Salvare la vendita crea/collega la pratica e l'unità in un'unica transazione e abilita il modulo Clienti.
- Appartamento e box possono condividere lo stesso cliente. Cambiare acquirente collega una pratica diversa; richieste, documenti e storico restano al cliente originario. Il nome della pratica è riutilizzato nelle vendite collegate.
- Pratiche con più intestatari/referenti testuali e più unità; richieste, scelte capitolato, stati, ambiti, responsabili e data obiettivo. Le date non generano automaticamente nuove scadenze Calendar.
- Libretto con schede tecniche per ambito/edificio/unità. Categoria e ambito sono compilabili; non impongono una tassonomia normativa.
- Ogni salvataggio di scheda conserva una revisione con autore e data. Nessuna eliminazione delle schede; chiusura/superamento tramite stato.
- Documenti su Drive, revisioni immutabili e collegamento dello stesso documento a più schede. Caricamento fino a 4 MB per richiesta; PDF, JPG/PNG/WebP, DOCX/XLSX, ZIP, DWG/DXF.
- Gli utenti attivi interni possono consultare e aggiornare i fascicoli secondo il modello di accesso corrente. Non è un portale cliente e non introduce condivisione esterna. Vendite e approvazione acconti mantengono l'accesso admin elevato esistente.

## Persistenza e compatibilità

Migrazioni additive `20261028120000_job_order_dossiers` e `20261028150000_sale_customer_link`: impostazioni, tabelle fascicoli/documenti e collegamento esplicito della vendita alla pratica cliente. Le unità commerciali vengono riutilizzate, le pratiche sopravvivono all'annullamento di una vendita e i documenti non vengono duplicati.

`scripts/link-existing-sale-customers.ts` recupera in modo idempotente le vendite precedenti, ricostruendo per commessa i gruppi appartamento/box registrati con lo stesso nominativo. Non unisce pratiche che risultano già esplicitamente distinte. Per San Rainaldo sono presenti 9 unità vendute in 4 gruppi cliente.

I salvataggi di Dati, Budget e Moduli aggiornano soltanto i propri campi, con controllo di versione per rifiutare una modifica concorrente. La nuova overview carica le sintesi in blocco e riusa le regole economiche della dashboard; non scarica una dashboard completa per ogni riga.

## Verifiche

- `npm run build`
- `npm run test:commesse`: migrazioni e integrazione in schema PostgreSQL temporaneo, senza modificare dati applicativi reali.
- `npm run test:sales`: regressione del ciclo vendite/scadenze/acconti.
- `npx tsx scripts/test-job-order-browser.ts`: verifica browser con account e schema temporanei; richiede build completata, browser locale e credenziali Drive. I file di prova sono eliminati da Drive al termine.

Non eseguire due `prisma migrate deploy` contemporaneamente anche su schemi diversi dello stesso database, perché condividono l'advisory lock. Non avviare `next build` mentre il test browser usa la build locale.
