# Suggerimenti per le bolle scansionate

Analisi del 25 ottobre 2026: 217 bolle, 216 scansioni inserite e 19 rifiutate; nessuna scansione nuova al momento della verifica. EDILMELZI SRL ha 52 bolle su 5 commesse, UNICAL 27 su 2, EDILMELZI GORGONZOLA 21 su 1, CAL FER 16 su 3. Le descrizioni includono materiali e annotazioni di cantiere aggiunte a mano: lo storico non può sostituire il contenuto del nuovo documento.

## Flusso

La ricezione di una scansione da Gmail avvia la preparazione OCR tramite `after()` di Next.js. Il risultato (testo e suggerimenti) viene conservato nel record della scansione, con stato `PENDING`, `PROCESSING`, `READY`, `ERROR` o `STOPPED`. La migrazione `20261025090000_scan_ocr_preparation` aggiunge i campi necessari. L'OCR italiano di Drive lavora su una copia temporanea convertita in Google Docs, eliminata dopo l'esportazione del testo. Il PDF originale non viene modificato.

L'OCR usa le credenziali Drive già configurate in produzione, inclusa `GOOGLE_DRIVE_REFRESH_TOKEN`. Le variabili sensibili esportate da Vercel possono essere solo segnaposto e non consentire prove OCR locali. Gli errori OCR lasciano disponibile la compilazione manuale e vengono segnalati nell'interfaccia.

L'elenco delle nuove scansioni restituisce i suggerimenti già pronti: il popup li applica immediatamente senza una nuova richiesta OCR. Per una scansione ancora in elaborazione il client consulta lo stato ogni 1,5 secondi, senza sovrascrivere modifiche manuali. La preparazione dispone di un lease nel database, condiviso tra istanze: evita doppie elaborazioni e recupera tentativi interrotti dopo cinque minuti. Ogni sincronizzazione Gmail e l'apertura dell'elenco recuperano anche l'eventuale arretrato, in lotti di sei con due worker. Il cron `/api/cron/scansioni-ocr` costituisce un ulteriore recupero giornaliero, compatibile con il piano Vercel Hobby; l'avvio immediato delle nuove scansioni è legato all'importazione e non dipende dal cron. Lo storico viene letto una sola volta per la preparazione di ciascuna nuova scansione: gli inserimenti umani influenzano le scansioni successive.

## Regole

- Fornitore: nome riconosciuto nel testo, ignorando maiuscole, punteggiatura e forme societarie; precedenza alle denominazioni più specifiche. In assenza di nomi leggibili, il mittente è usato solo con almeno 3 precedenti e una corrispondenza di almeno il 90%.
- Data: date italiane valide, precedenza alle etichette del documento; esclusione delle scadenze, dei riferimenti normativi e delle date ambigue. I numeri di paragrafo come `11.3.2.10.3` non sono interpretati come date. Nessun ripiego silenzioso sulla data odierna o di ricezione email.
- Descrizione: descrizioni storiche del fornitore effettivamente presenti nel nuovo testo; in alternativa righe materiali riconoscibili dopo l'intestazione della tabella o il prodotto riportato nella scheda tecnica del calcestruzzo. Non vengono ricopiate annotazioni storiche assenti dal PDF.
- Commessa: una sola commessa di cantiere attiva con nome o indirizzo presenti nel testo, oppure almeno due parole distintive del nome nella sezione di destinazione della merce; in alternativa almeno 3 precedenti del fornitore tutti su una sola commessa ancora attiva. Le proposte derivate dallo storico hanno affidabilità media.

## Conferma umana

I campi suggeriti sono azzurri e mostrano solo il grado di affidabilità accanto all'etichetta. Il popup non mostra spiegazioni estese o il testo OCR. Tutti i campi sono modificabili. Una modifica elimina l'evidenziazione e annulla la conferma precedente. L'arrivo dei suggerimenti non sovrascrive i campi già modificati; chiudendo o cambiando scansione, la risposta precedente viene ignorata.

L'utente deve spuntare la verifica dei quattro campi e premere **Conferma e inserisci**. Il server rifiuta richieste prive di `humanConfirmed: true`. Nessuna richiesta di suggerimenti crea bolle o modifica i loro stati. L'inserimento confermato mantiene il consueto stato `PENDING` / **Da validare**.

Al salvataggio o rifiuto la preparazione passa a `STOPPED` e i suggerimenti temporanei vengono eliminati dal record della scansione. Il worker aggiorna i risultati solo se la scansione è ancora `NEW`: una risposta OCR tardiva non può modificare una bolla salvata. L'API suggerimenti restituisce HTTP 409 per le scansioni già inserite o rifiutate. La modifica di una bolla archiviata usa esclusivamente i valori salvati e non richiede suggerimenti.

## Verifiche

`npm run test:scans` esegue 23 test su riconoscimento, persistenza, concorrenza, recupero errori e salvataggio durante l'OCR. I test di preparazione usano un database simulato e non scrivono bolle reali.

`node --env-file=.env.production.local --import tsx scripts/verify-scan-production.ts` controlla il blocco delle scansioni già salvate, la preparazione delle scansioni nuove prima dell'apertura, la stabilità dei risultati tra richieste successive e il rifiuto degli inserimenti senza conferma. Non inserisce bolle. Richiede le credenziali applicative locali di produzione; il token di sessione di prova dura cinque minuti e non viene stampato o salvato.

Sui quattro testi OCR reali esaminati (due Edilmelzi, uno Unical e uno Cal Fer), le regole finali propongono tutti e quattro i campi. Date e commesse coincidono con gli inserimenti storici; le descrizioni riguardano i materiali, anziché annotazioni manuali di cantiere. Una scansione registrata come EDILMELZI SRL riporta nel documento **EDILMELZI Gorgonzola srl**: il suggerimento segue il PDF, senza correggere lo storico automaticamente. Quattro documenti non costituiscono una misura di accuratezza generale.
