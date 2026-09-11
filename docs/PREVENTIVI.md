# Modulo Preventivi

## Flusso

1. Il preventivo raccoglie i dati della futura commessa, macro capitoli, sottocapitoli e voci.
2. Il salvataggio crea automaticamente un'opportunità in stato `OPEN`.
3. L'opportunità può diventare aperta, sospesa, chiusa o approvata.
4. La prima approvazione crea la commessa e collega in modo permanente i due record.

I valori economici trasferiti alla commessa sono già al netto degli sconti sulle righe e dello sconto generale. Le voci personale alimentano il budget personale, i mezzi il budget mezzi e le voci libere/listino il budget materiali. Il totale netto diventa fatturato previsto.

## Fonti delle voci

- Personale: viene selezionato il ruolo. Il prezzo suggerito è la media dei costi orari correnti delle persone attive con quel ruolo.
- Mezzi e attrezzature: il prezzo suggerito è l'ultimo costo orario disponibile.
- Prezzario: codice, descrizione, unità e prezzo arrivano dalla versione attiva del listino.
- Voce libera: tutti i campi vengono compilati manualmente.

Ogni dato copiato nel preventivo rimane editabile e costituisce uno snapshot: i preventivi esistenti non cambiano quando viene caricato un nuovo listino.

## Aggiornamento prezzario

La pagina `Admin > Prezzario edilizia` accetta lo ZIP regionale completo oppure una selezione multipla dei file XLSX. Il browser estrae e legge i file, quindi invia le voci al server in blocchi compatibili con i limiti di upload Vercel.

Vengono importati i file A, C, E e F. Gli allegati B e D contengono le analisi prezzi e non vengono esposti come voci selezionabili. Una nuova versione diventa attiva soltanto dopo il completamento; quella precedente viene archiviata.

Per un'inizializzazione da terminale:

```powershell
npm run prezzario:import -- "C:\percorso\cartella-prezzario" "Nome versione"
```
