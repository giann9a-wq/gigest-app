# Suggerimenti per le bolle scansionate

Analisi del 25 ottobre 2026: 217 bolle, 216 scansioni inserite e 19 rifiutate; nessuna scansione nuova al momento della verifica. EDILMELZI SRL ha 52 bolle su 5 commesse, UNICAL 27 su 2, EDILMELZI GORGONZOLA 21 su 1, CAL FER 16 su 3. Le descrizioni includono materiali e annotazioni di cantiere aggiunte a mano: lo storico non può sostituire il contenuto del nuovo documento.

## Flusso

Aprendo una scansione, il client richiede `GET /api/documentale/scansioni/[id]/suggerimenti`. L'API richiede un utente attivo, legge lo storico e usa l'OCR italiano di Drive su una copia temporanea convertita in Google Docs. La copia viene eliminata dopo l'esportazione del testo. Il PDF originale non viene modificato. Non servono nuovi servizi, chiavi AI o migrazioni del database.

L'OCR usa le credenziali Drive già configurate in produzione, inclusa `GOOGLE_DRIVE_REFRESH_TOKEN`. Le variabili sensibili esportate da Vercel possono essere solo segnaposto e non consentire prove OCR locali. Gli errori OCR lasciano disponibile la compilazione manuale e vengono segnalati nell'interfaccia.

Il testo è conservato solo in memoria per 15 minuti, massimo 50 documenti per istanza. Le richieste simultanee sullo stesso documento condividono l'elaborazione. Lo storico viene riletto a ogni richiesta, così gli inserimenti e le correzioni umane influenzano le proposte successive. L'analisi considera le ultime 5.000 bolle e i fornitori del registro costi.

## Regole

- Fornitore: nome riconosciuto nel testo, ignorando maiuscole, punteggiatura e forme societarie; precedenza alle denominazioni più specifiche. In assenza di nomi leggibili, il mittente è usato solo con almeno 3 precedenti e una corrispondenza di almeno il 90%.
- Data: date italiane valide, precedenza alle etichette del documento; esclusione delle scadenze, dei riferimenti normativi e delle date ambigue. I numeri di paragrafo come `11.3.2.10.3` non sono interpretati come date. Nessun ripiego silenzioso sulla data odierna o di ricezione email.
- Descrizione: descrizioni storiche del fornitore effettivamente presenti nel nuovo testo; in alternativa righe materiali riconoscibili dopo l'intestazione della tabella o il prodotto riportato nella scheda tecnica del calcestruzzo. Non vengono ricopiate annotazioni storiche assenti dal PDF.
- Commessa: una sola commessa di cantiere attiva con nome o indirizzo presenti nel testo, oppure almeno due parole distintive del nome nella sezione di destinazione della merce; in alternativa almeno 3 precedenti del fornitore tutti su una sola commessa ancora attiva. Le proposte derivate dallo storico hanno affidabilità media.

## Conferma umana

I campi suggeriti sono azzurri e mostrano motivo e affidabilità. Tutti sono modificabili. Il testo riconosciuto è consultabile in un pannello espandibile accanto al PDF e viene restituito solo dall'API autenticata. Una modifica elimina l'evidenziazione e annulla la conferma precedente. L'arrivo dei suggerimenti non sovrascrive i campi già modificati; chiudendo o cambiando scansione, la risposta precedente viene ignorata.

L'utente deve spuntare la verifica dei quattro campi e premere **Conferma e inserisci**. Il server rifiuta richieste prive di `humanConfirmed: true`. Nessuna richiesta di suggerimenti crea bolle o modifica i loro stati. L'inserimento confermato mantiene il consueto stato `PENDING` / **Da validare**.

## Verifiche

`npm run test:scans` esegue 16 test su date, riferimenti normativi, omonimie, mittenti condivisi, commesse ambigue o concluse e descrizioni.

`node --env-file=.env.production.local --import tsx scripts/verify-scan-production.ts` controlla l'OCR su quattro scansioni storiche in produzione, il rifiuto degli inserimenti senza conferma e l'assenza di nuove bolle durante il test. Richiede le credenziali applicative locali di produzione; il token di sessione di prova dura cinque minuti e non viene stampato o salvato.

Sui quattro testi OCR reali esaminati (due Edilmelzi, uno Unical e uno Cal Fer), le regole finali propongono tutti e quattro i campi. Date e commesse coincidono con gli inserimenti storici; le descrizioni riguardano i materiali, anziché annotazioni manuali di cantiere. Una scansione registrata come EDILMELZI SRL riporta nel documento **EDILMELZI Gorgonzola srl**: il suggerimento segue il PDF, senza correggere lo storico automaticamente. Quattro documenti non costituiscono una misura di accuratezza generale.
