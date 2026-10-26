# Rigetto dei suggerimenti di anagrafiche duplicate

In Admin → Controlli → Anagrafiche Duplicate, aprendo i collegamenti di una voce:

- **Rigetta** nasconde permanentemente il singolo abbinamento proposto.
- **Rigetta tutti i suggerimenti per questa voce** esclude la voce dalle proposte automatiche, incluse eventuali nuove corrispondenze future.

Il rifiuto è condiviso fra gli amministratori e conservato in `AppSetting`, usando chiavi `supplierLinkRejection:v1:` seguite da un hash della voce e del collegamento. Ogni decisione usa un proprio record con upsert, evitando conflitti fra decisioni simultanee. Nome sorgente, destinazione, amministratore e data sono conservati per tracciabilità. Non sono necessarie migrazioni.

Il filtro dei rigetti viene applicato prima dei limiti su candidati e numero di voci, aggiornando anche il conteggio delle anagrafiche simili. Differenze di maiuscole, accenti, punteggiatura e forma societaria non fanno ricomparire lo stesso collegamento. Un cambio effettivo del nome della voce rende invece possibili nuove proposte per la nuova denominazione.

Il rigetto non modifica risorse, diario o fornitori. Il collegamento manuale resta disponibile. Entrambe le azioni richiedono l'accesso amministrativo aggiuntivo già richiesto per collegare le anagrafiche.

`npm run test:supplier-links` verifica persistenza del filtro, indipendenza delle proposte, varianti dei nomi, esclusione totale, idempotenza e validazione degli input usando un database simulato.
