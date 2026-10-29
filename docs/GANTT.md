# Pianificazione Gantt delle commesse

La scheda commessa, nel tab **Dati Commessa**, contiene **Pianificazione Gantt**.
Ogni piano comprende sezioni riordinabili con descrizione, attività con intervallo di date,
milestone e milestone intermedie con una sola data. Ogni voce ha titolo, descrizione e stato.
Il salvataggio è separato dai dati anagrafici e dal budget; le modifiche concorrenti vengono
rilevate tramite versione, per evitare sovrascritture involontarie.

La pagina autenticata `/dashboard002` è un'anteprima senza collegamenti nel menu e con
indicizzazione disabilitata. Usa gli stessi componenti della dashboard, aggiungendo gli
accordion Meteo e Gantt. La pagina `/dashboard` mantiene il comportamento precedente.

Il riepilogo Gantt include le commesse SITE e OTHER. La barra di ciascuna commessa va
dalla prima all'ultima data pianificata, comprese le milestone. Espandendo la riga si
vedono sezioni e singole voci sullo stesso asse temporale. In assenza di attività viene
mostrato **Da pianificare**: non si generano date presunte né si modificano le date
anagrafiche della commessa. Sono disponibili vista completa, mese, trimestre e anno.

I dati sono salvati nella tabella `JobOrderSchedule`, collegata alla commessa.
La migrazione `20261029100000_job_order_gantt` è additiva.

## Verifiche

- `npm run build`
- `npm run test:gantt`: validazione date, intervalli, milestone, conflitti concorrenti e
  persistenza in uno schema PostgreSQL temporaneo isolato.
- `TEST_GANTT_UI=1` abilita anche le verifiche browser sul build locale: editor,
  riordino, salvataggio, dashboard di anteprima, meteo, accessi e viste desktop/mobile.
  La verifica controlla che la dashboard principale non contenga i nuovi accordion.
