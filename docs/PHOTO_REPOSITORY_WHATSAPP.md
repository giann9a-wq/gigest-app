# Foto cantiere e integrazione WhatsApp

## Contesto GiGest

GiGest usa Next.js App Router, Auth.js, Prisma/PostgreSQL e Google Drive per il documentale. Il repository fotografico è stato inserito come quarto tab della pagina **Documentale**, accanto a Bolle di Cantiere, Bolle da inserire e Allegati Risorse.

La V1 non usa AI, OCR o classificazione automatica. Tutte le scelte sono esplicite e gestite da una macchina a stati persistita.

## Architettura

```text
WhatsApp Cloud API -> webhook -> adapter provider -> workflow persistito
                                            |
                                            v
                                servizi repository fotografico
                                            |
                              PostgreSQL + Google Drive
```

Il provider Meta è isolato in `lib/whatsapp/provider.ts`; il workflow in `lib/whatsapp/workflow.ts` non dipende dal formato originale del webhook. Lo stesso workflow è usato dal simulatore locale.

Il webhook salva prima ogni messaggio in `WhatsAppInboundEvent` usando il `message_id` Meta come chiave univoca e risponde immediatamente. L'elaborazione successiva usa una inbox persistente con lease, retry progressivo e ordinamento per numero, evitando workflow concorrenti o duplicati sullo stesso mittente.

## Dati principali

- `PhotoPhase`: fasi specifiche per commessa, con confronto case-insensitive e normalizzato.
- `PhotoUpload`: batch con commessa, fase, autore, nota e origine.
- `Photo`: singolo media archiviato su Google Drive.
- `WhatsAppUploadSession`: sessione temporanea e stato del workflow.
- `WhatsAppInboundEvent`: inbox durevole, deduplicazione e retry dei webhook.
- `PhotoAuditEvent`: audit di caricamenti, eliminazioni, annullamenti e scadenze.
- `User`: telefono, prefisso, numero E.164, abilitazione WhatsApp e ID Meta opzionale.

## Configurazione

1. Applicare la migrazione Prisma `20260825120000_photo_repository_whatsapp`.
2. Verificare che Google Drive documentale sia già collegato.
3. Configurare le variabili `META_WHATSAPP_*` indicate in `.env.example`.
4. Configurare in Meta il webhook pubblico:
   - verifica e ricezione: `/api/integrations/whatsapp/webhook`;
   - verify token: valore di `META_WHATSAPP_VERIFY_TOKEN`.
5. Nell'area **Admin > Accessi**, associare prefisso e numero agli utenti autorizzati e attivare **Abilita WhatsApp**.
6. Invocare periodicamente `/api/cron/whatsapp-session-cleanup` con il secret cron. Lo stesso endpoint chiude le sessioni inattive e recupera gli eventi inbox falliti o rimasti in elaborazione.

Per un ambiente Vercel Pro è consigliata una frequenza di cinque minuti:

```json
{
  "path": "/api/cron/whatsapp-session-cleanup",
  "schedule": "*/5 * * * *"
}
```

Su Vercel Hobby i cron possono essere eseguiti al massimo una volta al giorno: per retry tempestivi usare uno scheduler esterno autenticato oppure passare a un piano con frequenza al minuto.

## Collaudo senza Meta

In sviluppo, aprire **Documentale > Foto cantiere > Simula WhatsApp**. Il simulatore permette di:

1. inviare una o più fotografie;
2. per un invio multiplo, indicare una sola volta se appartengono tutte alla stessa commessa;
3. scegliere commessa e fase tramite le opzioni registrate dal provider mock; scegliendo commesse diverse, il flusso assegna le fotografie una alla volta;
4. creare una nuova fase;
5. aggiungere o saltare la nota;
6. confermare e verificare la comparsa immediata del batch nel repository.

Il mock usa file temporanei sotto `tmp/whatsapp-mock-media` e li elimina alla conferma, all'annullamento o alla scadenza.

## Autorizzazioni

Il modulo applica una regola esplicita e centralizzata: ogni utente GiGest `ACTIVE` può selezionare qualsiasi commessa `ACTIVE` di tipo cantiere/altro. Le commesse concluse con fotografie restano consultabili nello storico, ma non accettano nuovi caricamenti. L'eliminazione è consentita all'autore del batch o a un admin.
