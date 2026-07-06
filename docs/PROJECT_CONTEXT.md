# GiGEST - Contesto operativo progetto

Ultimo aggiornamento: 2026-06-25

Questo documento raccoglie il contesto ricavato dalle chat Codex del progetto `C:\gigest-starter` e dallo stato attuale del repository. Serve come memoria rapida per contestualizzare evolutive, bugfix e deploy.

## Identita del progetto

GiGEST e un gestionale tecnico per commesse, risorse, diario cantiere, documentale, costi actual, ricavi, scadenze, formazione e manutenzioni.

Stack principale:

- Next.js 15 con App Router in `app/`.
- React 19.
- Auth.js / NextAuth beta con login Google.
- Prisma 6 su PostgreSQL.
- Vercel per hosting e cron.
- Neon consigliato per database produzione.
- Supabase Storage indicato nella documentazione iniziale, ma diverse funzioni documentali recenti usano Google Drive.
- Google Calendar per scadenziario condiviso.
- Gmail / Google Drive per scansioni bolle e documenti.
- Excel gestito con `xlsx`.

## Preferenze operative dell'utente

- Quando una modifica e completata, di norma l'utente vuole anche il deploy su Vercel.
- Il dominio pubblico di riferimento e `https://gigest.vercel.app`.
- La produzione Vercel e considerata spesso la fonte da cui riallineare il locale se un'evolutiva genera regressioni.
- In caso di bug frontend dopo deploy, meglio tornare a una versione stabile e poi riallineare il repository locale a quella versione.
- Preferenza per interventi pratici end-to-end: analisi codice, implementazione, build, deploy, verifica HTTP/log.
- Preferenza UI: stile coerente GiGEST, card bianche, bordi arrotondati, arancione GiGEST per link/azioni principali.
- Tabelle operative: quando i campi sono pochi, devono idealmente stare in una schermata, con colonne strette e leggibili.
- Link "Apri Scheda" preferito come link testuale arancione, non come bottone pesante.
- Evitare duplicazioni logiche: riusare API, modelli Prisma e funzioni gia esistenti.
- Per dati critici, evitare autosalvataggio a DB se l'utente chiede controllo manuale: usare bozze locali persistenti e scrivere solo su "Salva".

## Preferenze deployment

Flusso usato piu volte con successo:

1. Verificare stato repo:
   `git status --short --branch`
2. Eseguire build:
   `npm run build`
3. Se ci sono migrazioni Prisma per produzione:
   `npx prisma migrate deploy`
   usando la `DATABASE_URL` di produzione.
4. Deploy diretto production:
   `npx vercel --prod`
5. Verificare che Vercel risponda `Ready`.
6. Verificare URL pubblico:
   `https://gigest.vercel.app`
7. Se opportuno, controllare log errori recenti Vercel.
8. Commit e push su `main`, o commit/push prima del deploy se richiesto dal contesto.

Note ricorrenti:

- La CLI Vercel puo non essere installata globalmente: usare `npx vercel`.
- In PowerShell quotare i path con parentesi, ad esempio `app\(app)\...`, quando si fa `git add`.
- `tsconfig.tsbuildinfo` puo essere generato dalla build: non va incluso nei commit salvo decisione esplicita.
- Warning noto: durante build/deploy puo comparire warning `jose` / Edge Runtime, gia visto senza bloccare deploy.
- Il progetto ha `vercel.json` con cron separati estate/inverno:
  - `/api/cron/diary-reminder-summer` alle `07:00 UTC`.
  - `/api/cron/diary-reminder-winter` alle `08:00 UTC`.

## Alberatura informatica sintetica

Root:

- `app/`: pagine App Router e route API.
- `components/`: componenti UI condivisi.
- `lib/`: logiche di dominio, integrazioni, import/export, PDF, email, query.
- `prisma/`: schema, seed e migrations.
- `docs/`: documentazione tecnica.
- `.vercel/`: collegamento progetto Vercel locale.

Pagine principali:

- `app/(public)/login/page.tsx`: login.
- `app/(app)/dashboard/page.tsx`: dashboard generale.
- `app/(app)/commesse/page.tsx`: elenco commesse.
- `app/(app)/commesse/[id]/page.tsx`: scheda commessa.
- `app/(app)/commesse/overview/page.tsx`: overview commesse.
- `app/(app)/commesse/costi/page.tsx`: pagina Costi globale.
- `app/(app)/dashboard-commessa/page.tsx`: dashboard commessa.
- `app/(app)/dashboard-commessa/costi/page.tsx`: costi da dashboard commessa.
- `app/(app)/risorse/page.tsx`: personale.
- `app/(app)/mezzi/page.tsx`: mezzi e attrezzature.
- `app/(app)/risorse/[id]/page.tsx`: scheda persona.
- `app/(app)/mezzi/[id]/page.tsx`: scheda mezzo/attrezzatura.
- `app/(app)/risorse/formazione/page.tsx`: vista aggregata formazione.
- `app/(app)/risorse/manutenzioni/page.tsx`: vista aggregata manutenzioni.
- `app/(app)/dashboard-caricamenti/page.tsx`: dashboard annuale caricamenti.
- `app/(app)/caricamenti/page.tsx`: caricamenti.
- `app/(app)/diario/page.tsx`: diario cantiere.
- `app/(app)/documentale/page.tsx`: documentale.
- `app/(app)/scadenziario/page.tsx`: scadenziario.
- `app/(app)/stampa-risorse-mese/page.tsx`: stampa risorse mese.
- `app/(app)/statistiche-risorse-commesse/page.tsx`: statistiche risorse/commesse.
- `app/(app)/admin/page.tsx`: area admin.
- `app/(app)/admin/controlli/page.tsx`: controlli admin.
- `app/(app)/admin/import-costi/page.tsx`: import costi.
- `app/(app)/admin/import-fatture/page.tsx`: import fatture.
- `app/(app)/admin/import-massivo/page.tsx`: import massivo cross-commessa.
- `app/(app)/admin/gestione-db/page.tsx`: gestione database/backup.
- `app/(app)/admin/acconti/page.tsx`: acconti.
- `app/(app)/admin/accessi/page.tsx`: accessi.
- `app/(app)/admin/news/page.tsx`: news.

Componenti chiave:

- `components/diary/daily-log-page.tsx`: diario cantiere, bozze locali, stampa PDF, risorse, materiali, bolle.
- `components/dashboard/job-dashboard-view.tsx`: dashboard commessa, ricavi/costi accordion, viste economiche.
- `components/layout/resource-tabs.tsx`: tab risorse.
- `components/layout/job-order-tabs.tsx`: tab commesse.
- `components/layout/admin-functions-nav.tsx`: navigazione admin.
- `components/admin/cost-import-panel.tsx` e `cost-import-validation.tsx`: import/validazione costi.
- `components/admin/invoice-import-panel.tsx` e `invoice-import-validation.tsx`: import/validazione fatture.
- `components/admin/diary-reminder-controls.tsx`: controlli reminder diario.
- `components/dashboard/training-roll-button.tsx`: roll formazione.
- `components/dashboard/maintenance-roll-button.tsx`: roll manutenzione.

Librerie di dominio principali:

- `lib/prisma.ts`: client Prisma.
- `lib/caricamenti.ts`: logiche caricamenti.
- `lib/caricamenti-dashboard.ts`: dashboard caricamenti.
- `lib/job-order-dashboard.ts`: dashboard commesse.
- `lib/job-order-revenue.ts`: ricavi/acconti.
- `lib/cost-actual-import.ts`: import costi actual.
- `lib/cost-actual-queries.ts`: query costi actual.
- `lib/invoice-import.ts`: import fatture.
- `lib/mass-import.ts`: import massivo.
- `lib/monthly-resource-report.ts`: dati report mensile risorse.
- `lib/monthly-resource-report-pdf.ts`: PDF stampa risorse mese.
- `lib/monthly-email-automations.ts`: automazioni email mensili.
- `lib/diary-reminder-job.ts`: reminder compilazione diario.
- `lib/google-calendar.ts`: integrazione calendario.
- `lib/google-drive-document-storage.ts`: storage documenti Google Drive.
- `lib/gmail-scans.ts` e `gmail-scans-sync-runner.ts`: scansione Gmail.
- `lib/gmail-mailer.ts`: invio email.
- `lib/admin-supplier-links.ts`: collegamenti fornitori simili.
- `lib/loading-verification.ts`: controlli caricamenti.
- `lib/schedule-events.ts`: eventi/scadenze.

## Modelli Prisma principali

Anagrafiche e accesso:

- `User`, `AccessRequest`, `AdminPanelCredential`, `AdminPanelSession`, `AppSetting`.
- Auth.js: `Account`, `Session`, `VerificationToken`.

Risorse:

- `Person`, `PersonCost`.
- `Equipment`, `EquipmentCost`.
- `Training`, `TrainingDocument`.
- `Maintenance`, `MaintenanceDocument`.

Commesse e produzione:

- `JobOrder`.
- `DiaryActivity`.
- `ExternalResource`, `ExternalDiaryActivity`.
- `MaterialUsage`.
- `DeliveryNoteUsage`, `DeliveryNoteDocument`, `ScannedDeliveryNote`.

Economics:

- `CostImportSession`, `CostImportRowStaging`, `CostActualEntry`, `CostImportCorrectionRule`.
- `InvoiceImportSession`, `InvoiceImportRowStaging`, `IssuedInvoiceActual`.
- `JobOrderAdvance`.

Scadenze e automazioni:

- `Deadline`.
- `CalendarIntegration`, `CalendarEventMapping`.
- `DiaryReminderEmailLog`, `AutomationEmailLog`.
- `AutoDiaryEntryProposal`.

Enum importanti:

- `JobType`: include `SITE`, `TRAINING`, `LEAVE`, `SICKNESS`, `RAIN`, `NATIONAL_HOLIDAY`, `OTHER`.
- `ResourceType`: `PERSON`, `EQUIPMENT`.
- `EquipmentType`: `VEHICLE`, `EQUIPMENT`.
- `CostActualCategory`: materie prime, prestazioni professionali, prestazioni terzi, spese varie.
- `DeadlineOrigin`: manuale, manutenzione, formazione.

## Funzionalita e decisioni emerse dalle chat

### Formazione

- Aggiunta una sezione Formazione per il personale, simile alle manutenzioni dei mezzi.
- Campi previsti: corso, descrizione, data, obbligatorio, data scadenza, allegato PDF.
- Gli allegati formazione sono su Google Drive tramite `TrainingDocument.driveFileId`.
- Aggiunta pianificazione/ricorrenza formazione con roll della scadenza.
- Le date future dei corsi devono comparire in calendario, scadenziario e dashboard anche quando non sono solo "data scadenza".
- Le viste aggregate di formazione scrivono sulle stesse tabelle delle schede risorsa.

### Manutenzioni

- Manutenzioni mezzi su `Maintenance`, documenti su `MaintenanceDocument`.
- Presente ricorrenza con `nextIntervention`, `isRecurring`, `recurrenceMonths`.
- Il roll manutenzione aggiorna la scadenza collegata.
- Vista aggregata in Gestione Risorse: inserimento centralizzato con ribaltamento sulla scheda mezzo.

### Documentale

- Documentale include bolle/scansioni e un tab "Allegati Risorse".
- "Allegati Risorse" deve mostrare allegati personale e mezzi in forma alberata tipo cartelle.
- API dedicata: `app/api/documentale/risorse-allegati/route.ts`.
- Per scansioni bolle: integrazione Gmail/Drive, stati `NEW`, `INSERTED`, `REJECTED`, `ERROR`.

### Diario cantiere

- Il diario usa `DiaryActivity` per persone/mezzi e `ExternalDiaryActivity` per subappalto/economia.
- I fornitori/risorse esterne digitati a mano devono suggerire fornitori gia noti dai costi, con frequenza e search-like.
- L'utente ha chiesto esplicitamente di rimuovere autosalvataggio verso DB:
  - righe in modifica in bozza locale persistente nel browser;
  - bozza separata per data;
  - DB scritto solo con pulsante "Salva";
  - righe in bozza evidenziate azzurrine;
  - nessun blocco fastidioso su cambio pagina/uscita se la bozza e persistente.
- PDF Diario:
  - rimuovere card riepilogative in alto;
  - colonna ore stretta;
  - descrizione piu larga;
  - sezione "Bolle e Materiali" del giorno con data, fornitore, commessa, descrizione;
  - nome file con data del giorno stampato, o primo giorno se range.

### Scadenziario e calendario

- Scadenze da `Deadline`, sincronizzabili con Google Calendar.
- Manutenzioni e formazione possono generare scadenze collegate.
- Le date future di formazione devono essere trattate come eventi visibili.
- Google Calendar condiviso GiGEST e configurabile da Scadenziario.

### Dashboard caricamenti

- Sezione `Dashboard Caricamenti` per analisi annuale risorse.
- Include personale e mezzi; esclude attrezzature.
- KPI richiesti:
  - ore YTD;
  - costo cumulato YTD;
  - commessa prevalente;
  - percentuale allocazione;
  - numero commesse;
  - ultimo caricamento.
- Dettaglio risorsa:
  - KPI annuali;
  - distribuzione per commessa;
  - stacked bar mensile 100%;
  - tabella mensile.
- Export Excel previsto.

### Dashboard commessa

- Costi/ricavi actual sono centrali per la dashboard.
- "Ricavi actual" deve essere accordion collassabile, con totale visibile da chiuso.
- Righe dettaglio in tabella devono essere vere righe tabellari, non `details` schiacciati in una cella unica, quando il layout crea righe troppo spesse.

### Gestione costi

- Da "Vedi Costi" aperto da dashboard commesse, modifica deve permettere cambio commessa e tipologia spesa.
- Export Excel di tutte e quattro le categorie in un unico file.
- Pagina globale "Costi" in Gestione Commesse con filtri per fornitore, commessa, date, tipologia e export.
- Validazione import costi:
  - tabella scrollabile/coerente con elenco commesse;
  - rimuovere colonne frontend "Documento" e "Conto Sorgente";
  - approvazione e conferma in actual con un solo tasto.
- Import cross-commessa:
  - caricamento Excel non vincolato a singola commessa;
  - prealimentazione automatica commessa sulla base dei match storici;
  - validazione commessa per commessa in tab.

### Fornitori simili

- Nella sezione controlli admin deve esserci un accordion che trova fornitori digitati a mano e poi importati nei costi con nomi simili.
- Deve essere possibile collegare le anagrafiche e sostituire nello storico il nome digitato manualmente con quello consolidato.
- Logica in `lib/admin-supplier-links.ts`.

### Stampa risorse mese e PDF mensile

- La mail di fine mese deve allegare lo stesso PDF generato dal tab "Stampa ore mese", non una generazione separata.
- PDF risorse mese:
  - accordion "ore lavorate" visibile solo per risorse con mansione "Operaio";
  - in stampa PDF accordion espanso;
  - dettaglio commesse con almeno un caricamento;
  - ritocchi richiesti: `Tipo` e `Totale` piu grandi, tipologie allineate a sinistra, commesse a destra, bordi sottili.

### Controlli admin

- Flag `Person.excludeFromChecks` per escludere una risorsa dai controlli.
- Controllo "Verifica caricamenti" e "Giornate incomplete" devono usare la stessa logica, fermandosi al giorno precedente e non includendo la giornata corrente.
- Festivita nazionale:
  - sezione admin per inserire centralmente festivita su tutte le risorse;
  - collegamento a commessa e giorni;
  - elenco festivita italiane precaricato quando possibile;
  - `JobType.NATIONAL_HOLIDAY`.

### Reminder diario

- Cron Vercel separati estate/inverno per invio alle 09:00 ora italiana.
- In caso di mancata mail, controllare prima:
  - `DiaryReminderEmailLog` in DB produzione;
  - log Vercel delle route cron.
- Se non ci sono log DB ne chiamate Vercel, il problema probabile e trigger cron non partito.
- Rotte attuali:
  - `app/api/cron/diary-reminder-summer/route.ts`
  - `app/api/cron/diary-reminder-winter/route.ts`
  - `app/api/cron/diary-reminder/route.ts`
- Il pulsante admin "Invia promemoria ora" resta il recupero manuale.
- Oggetto mail desiderato: include nome risorsa.

## Note UI ricorrenti

- Preferenza per pagine operative, non landing.
- Mantenere densita informativa alta ma ordinata.
- Tabelle compatte quando possibile.
- Evitare righe inutilmente spesse.
- Accordion utili per sezioni corpose, con totale o sintesi visibile nel titolo.
- Stile GiGEST: bianco, arancione, bordi arrotondati, responsive.
- Le modifiche responsive vanno sempre considerate, soprattutto per griglie form e tabelle.

## Comandi utili

Sviluppo:

```powershell
npm install
npm run dev
npm run build
npx tsc --noEmit
```

Prisma:

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
npm run seed
```

Deploy:

```powershell
npm run build
npx vercel --prod
```

Git:

```powershell
git status --short --branch
git diff --check
git add "app\(app)\..."
git commit -m "messaggio"
git push origin main
```

## Attenzioni prima di modificare

- Controllare sempre se esistono gia API e funzioni in `lib/` prima di crearne di nuove.
- Per nuove feature persistenti, verificare `prisma/schema.prisma` e migrations.
- Non duplicare logiche PDF/email: in particolare la mail mensile deve riusare lo stesso PDF della stampa risorse mese.
- Se si toccano upload/documenti, capire se il flusso usa Google Drive o Supabase.
- Se si toccano crons/reminder, verificare sia `vercel.json` sia log DB.
- Se si toccano path sotto `app/(app)`, ricordarsi delle parentesi in PowerShell.
- Prima del deploy, fare almeno `npm run build`; se e una modifica TypeScript delicata, anche `npx tsc --noEmit`.

