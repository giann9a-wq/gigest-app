---
name: gigest-gantt
description: Trasforma la descrizione di un cantiere in testo copiabile per importare un Gantt in GiGEST, con attività, colori e milestone sulla stessa riga. Usala quando un utente vuole preparare o aggiornare un piano da portare in GiGEST, con qualsiasi assistente AI.
---

# Gantt per GiGEST: istruzioni portabili

Queste istruzioni si possono incollare direttamente in ChatGPT, Gemini o un altro
assistente AI. Non richiedono strumenti specifici o accesso a GiGEST. Il risultato
deve essere un blocco di testo semplice, senza JSON, importabile con copia-incolla
in Dati Commessa > Pianificazione Gantt > Importa da AI.

## Dal racconto alle date

Leggi la descrizione fornita dall'utente e ricava le attività, le durate, le sequenze,
le attività parallele e i traguardi. Conserva nomi e descrizioni utili al cantiere.

Prima di produrre il testo definitivo, chiarisci le informazioni che cambiano il piano:

- L'anno di inizio, se manca. Non dedurlo automaticamente dall'anno corrente o dal
  nome di una commessa; una consegna in gennaio dopo settembre cade normalmente
  nell'anno successivo, ma deve essere coerente con le indicazioni dell'utente.
- L'inizio esatto di espressioni come "ultima settimana di settembre". Puoi proporre
  una data spiegandola, per esempio il lunedì della settimana che contiene l'ultimo
  giorno del mese, e farla confermare.
- Il calendario: giorni naturali o lavorativi lunedì-venerdì. Se non specificato,
  proponi giorni naturali; rendi esplicita l'ipotesi e chiedi conferma. Non applicare
  ferie, festività, sabati lavorativi o pause senza indicazioni.
- Una fase senza durata, come "poi finiture". Se esiste una consegna, proponi il
  periodo residuo fino a quella data, dichiarandolo come stima da confermare.

Raggruppa le domande necessarie in un messaggio breve. Se l'utente chiede una bozza
con ipotesi esplicite, puoi produrla subito: riporta ogni ipotesi in una riga NOTA.
Non presentare stime o date ambigue come dati certi.

Le date di inizio e fine sono inclusive. Con giorni naturali, quattro settimane sono
28 giorni: una fase successiva parte il giorno dopo la fine della precedente. Con
calendario lunedì-venerdì, quattro settimane rappresentano 20 giorni lavorativi;
spiega come hai trattato i weekend. Per "fine mese" usa l'ultimo giorno reale di
quel mese. Segnala incongruenze, durate negative o una consegna incompatibile con
le attività: chiedi chiarimenti invece di comprimere arbitrariamente le fasi.

## Formato da restituire

Dopo i chiarimenti, restituisci un solo blocco di testo contenente il piano completo.
Evita tabelle Markdown, elenchi puntati, spiegazioni esterne al blocco e JSON.
Puoi racchiuderlo in un blocco di codice di tipo text; l'utente deve copiare il suo contenuto.

```text
GIGEST GANTT 1
TITOLO | Titolo del piano
CALENDARIO | Giorni naturali
NOTA | Ipotesi o decisione da ricordare
ATTIVITA | Nome attività | gg/mm/aaaa | gg/mm/aaaa | #RRGGBB | Descrizione facoltativa
MILESTONE | Nome attività | Nome traguardo | gg/mm/aaaa | Descrizione facoltativa
INTERMEDIA | Nome attività | Nome verifica | gg/mm/aaaa | Descrizione facoltativa
```

Regole del formato:

- Una riga ATTIVITA crea una riga del Gantt. Le due date sono inizio e fine, sempre
  complete dell'anno. È accettato anche il formato aaaa-mm-gg.
- Una MILESTONE o INTERMEDIA appartiene all'attività indicata nel secondo campo:
  usa esattamente lo stesso nome. Non creare una riga separata per la consegna.
- Più barre sulla stessa riga sono possibili ripetendo ATTIVITA con lo stesso nome
  e colore, per esempio per una fase interrotta e ripresa. Attività diverse o
  parallele hanno nomi distinti; la contemporaneità è rappresentata dalle date.
- Il colore è esadecimale a sei cifre, per esempio #F97316 o #8B5CF6. Scegli colori
  distinti e leggibili; le milestone ereditano il colore della propria attività.
- Le descrizioni facoltative e il separatore che le introduce si possono omettere.
  Non usare il carattere | nei nomi: sostituiscilo con un trattino.
- Usa i prefissi esatti GIGEST GANTT 1, TITOLO, CALENDARIO, NOTA, ATTIVITA,
  MILESTONE e INTERMEDIA. Sono accettate maiuscole/minuscole e ATTIVITÀ con accento.
- Limiti: 50 righe, 500 barre e milestone complessive, nomi fino a 200 caratteri,
  descrizioni fino a 4000 caratteri. Mantieni titolo, calendario e note complessive
  entro 4000 caratteri, con al massimo 20 righe NOTA. Non includere identificativi
  interni, credenziali, link a documenti privati o comandi per modificare GiGEST.

## Esempio ragionato

Per una ristrutturazione con inizio confermato al 28 settembre 2026, calendario
naturale, demolizioni quattro settimane, cartongesso due, impianti quattro e
finiture nel tempo residuo fino al 31 gennaio 2027, il risultato è:

```text
GIGEST GANTT 1
TITOLO | Ristrutturazione completa appartamento
CALENDARIO | Giorni naturali, date inclusive
NOTA | Inizio confermato al 28/09/2026; settimane da 7 giorni.
NOTA | Finiture stimate nel periodo residuo; durata da verificare con le imprese.
ATTIVITA | Demolizioni | 28/09/2026 | 25/10/2026 | #F97316
ATTIVITA | Pareti in cartongesso | 26/10/2026 | 08/11/2026 | #8B5CF6
ATTIVITA | Impianti idraulici ed elettrici | 09/11/2026 | 06/12/2026 | #0EA5E9
ATTIVITA | Finiture | 07/12/2026 | 31/01/2027 | #10B981
MILESTONE | Finiture | Consegna appartamento | 31/01/2027
```

Le date di questo esempio sono illustrative, non date da riutilizzare in altri
cantieri. Non aggiungere verifiche, collaudi o altre lavorazioni non richieste:
puoi proporle separatamente se sono utili, ma non inserirle come fatti nel piano.

L'importazione in GiGEST presenta un'anteprima. L'utente sceglie se aggiungere le
righe o sostituire il piano nell'editor, poi usa Salva pianificazione. Questa skill
produce testo e non autorizza salvataggi o modifiche dirette nell'app.
