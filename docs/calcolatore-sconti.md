# Calcolatore Sconti

Accesso da **Preventivi → Calcolatore Sconti** (`/preventivi/calcolatore-sconti`). Storico, opportunità ed editor dei preventivi conservano le rispettive pagine, API e operazioni.

Il form per nuove simulazioni, inclusi piano acconti e risultati, è in un accordion chiuso al primo caricamento. Sotto compare la tabella delle simulazioni, ordinate per ultimo aggiornamento, con 25 risultati al massimo per pagina. La paginazione è lato client e riutilizza l'API elenco esistente. Il click sulla riga (anche Invio/Spazio da tastiera) apre `/preventivi/calcolatore-sconti/[id]`, una pagina dedicata in consultazione con Modifica, Duplica, Scarica Excel e Torna alle simulazioni. Modifica abilita i campi; Salva modifiche torna in consultazione; Annulla ripristina i dati salvati. Duplica dalla tabella o dal dettaglio apre la pagina della copia. Il form dello storico serve solo alla creazione: Salva lo azzera e richiude l'accordion, Annulla lo azzera senza salvare. L'eliminazione richiede conferma e corregge la pagina corrente se l'ultima pagina resta vuota. I pulsanti di azione della tabella non attivano il click sulla riga.

## Calcoli e validazioni

Le funzioni pure sono in `lib/discount-calculator.ts`, condivise da UI, validazione API ed export. I calcoli monetari usano Decimal già incluso in Prisma. Le date sono date civili ISO, convertite in giorni UTC, senza dipendenza dal fuso orario o dall'ora legale.

- Interessi semplici ACT/365, somma a precisione completa e arrotondamento del totale ai centesimi.
- Fideiussione unica: totale di tutti gli acconti × tasso × giorni dal primo acconto al rogito / 365, arrotondata ai centesimi. Nessuna capitalizzazione del premio anticipato.
- Spesa fissa emissione fideiussione: parametro monetario non negativo, inizialmente 0 €, applicato una sola volta al primo acconto e sommato al premio annuo. Senza acconti non si applica alcun costo. Il costo totale riduce beneficio netto e sconto. Il dettaglio distingue premio annuo e spesa di emissione.
- Spesa variabile fideiussione: totale acconti × percentuale / 100, arrotondato ai centesimi e sommato al premio annuo e alla spesa fissa. Si applica una sola volta, senza proporzionarla ai giorni. Le nuove simulazioni partono da 0,05% (50 € su 100.000 €). Senza acconti il costo è zero.
- Beneficio netto anche negativo, sconto teorico non negativo, quota cliente 0–100%.
- Lo sconto proposto dalla quota è distinto da quello concedibile. Quest'ultimo viene limitato al saldo disponibile, così il saldo dopo lo sconto non diventa negativo. Il beneficio trattenuto riflette lo sconto effettivamente concedibile.
- Con dati incompleti o non validi i risultati sono indisponibili e salvataggio/export sono disabilitati. Importi positivi con massimo due decimali, tassi con massimo sei decimali, totale acconti entro il prezzo, date non successive al rogito. Il piano supporta fino a 500 acconti e date dal 1900, compatibili con Excel.

## Persistenza e autorizzazioni

Migrazione `20261011120000_discount_simulations`: tabelle `DiscountSimulation` e `DiscountAdvance`, importi Decimal, date PostgreSQL DATE, indici per aggiornamento/data e cancellazione degli acconti in cascade. Nessuna relazione obbligatoria con preventivi o commesse; riferimento facoltativo testuale. Autorizzazione tramite `getActiveAppUser`, con accesso condiviso agli utenti attivi come nelle API Preventivi. Autore, creazione e aggiornamento sono conservati.

Migrazione `20261012080000_discount_guarantee_fee`: aggiunge `guaranteeFee` Decimal(12,2), con default 0 e vincolo non negativo. I payload precedenti che non includono il campo continuano a essere accettati con valore 0. Il costo è conservato anche negli aggiornamenti e nelle copie.

Migrazione `20261012090000_discount_guarantee_variable_rate`: aggiunge `guaranteeVariableRate` Decimal(9,6), compreso fra 0 e 100. Le simulazioni esistenti mantengono 0% per conservare i risultati; il default per nuove simulazioni è 0,05%. I payload precedenti senza il campo sono accettati con 0%.

API:

- `GET /api/preventivi/simulazioni`: elenco.
- `POST /api/preventivi/simulazioni`: creazione, anche per duplicazione.
- `GET /api/preventivi/simulazioni/[id]`: apertura.
- `PUT /api/preventivi/simulazioni/[id]`: aggiornamento atomico dei parametri e del piano.
- `DELETE /api/preventivi/simulazioni/[id]`: eliminazione, con conferma nella UI.
- `POST /api/preventivi/simulazioni/export/excel`: export anche di una simulazione non salvata.

Per altri ambienti applicare `npm run prisma:deploy`, poi eseguire `npm run build`.

## Excel

`Scarica Excel` esporta i dati correnti e formule modificabili, date numeriche, formati monetari e percentuali, input in blu e risultati evidenziati. Usa XLSX e JSZip già presenti. Le formule coprono tutti gli acconti più almeno cinque righe libere (minimo 15), ricalcolano al caricamento e mostrano “Dati non validi” per le configurazioni incoerenti. Per superare le righe riservate occorre estendere le formule e i rispettivi intervalli, oppure esportare nuovamente dall'app.

La spesa fissa di emissione è un input in B13; la formula del costo totale in B22 la include una sola volta quando sono presenti acconti.
La percentuale di spesa variabile è un input in E4 (0,05% è memorizzato come 0,0005); il costo totale in B22 aggiunge il totale acconti B18 × E4, arrotondato ai centesimi.

Il riferimento allegato usa ACT/360 per gli interessi: l'export applica invece ACT/365, come richiesto nella specifica, dichiarandolo nel foglio. La fideiussione compare come calcolo unico sull'intero totale dalla prima data.

## Verifica

- `npm run test:discounts`: 22 test sui casi finanziari, date, validazioni, arrotondamenti, formule e struttura dell'export, incluse più di 15 righe, spesa fissa di emissione e spesa variabile sul totale acconti.
- `npm run test:discounts:db`: richiede il database configurato e migrato. Crea record temporanei, verifica salvataggio e riapertura, modifica del secondo acconto, aggiornamento atomico, duplicazione, eliminazione/cascade e rimuove i record di test in `finally`.
- `npm run build`: genera Prisma e verifica compilazione, tipi e build Next.js.

Caso di controllo: 50.000 € il 01/10/2026 e 50.000 € il 01/11/2027, rogito 31/12/2027, tasso 4,582%, fideiussione 1%. Interessi 3.238,78 €, fideiussione 1.249,32 €, beneficio/sconto al 100% 1.989,46 €, saldo finale 198.010,54 €. Cambiare solo la seconda data lascia invariata la fideiussione.

## File interessati

| Area | File |
| --- | --- |
| Navigazione e pagina | `components/layout/preventivi-tabs.tsx`, `components/preventivi/preventivi-workspace.tsx`, `app/(app)/preventivi/calcolatore-sconti/page.tsx`, `app/(app)/preventivi/calcolatore-sconti/[id]/page.tsx` |
| Interfaccia e stili | `components/preventivi/discount-calculator.tsx`, `components/preventivi/amount-input.tsx`, `app/globals.css` |
| Calcoli, persistenza ed Excel | `lib/discount-calculator.ts`, `lib/discount-simulation-store.ts`, `lib/discount-excel.ts` |
| API | `app/api/preventivi/simulazioni/route.ts`, `app/api/preventivi/simulazioni/[id]/route.ts`, `app/api/preventivi/simulazioni/export/excel/route.ts` |
| Database | `prisma/schema.prisma`, `prisma/migrations/20261011120000_discount_simulations/migration.sql`, `prisma/migrations/20261012080000_discount_guarantee_fee/migration.sql`, `prisma/migrations/20261012090000_discount_guarantee_variable_rate/migration.sql` |
| Test e comandi | `scripts/test-discount-calculator.ts`, `scripts/test-discount-persistence.ts`, `package.json` |
| Documentazione | `docs/calcolatore-sconti.md` |
