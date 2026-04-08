# GiGEST Starter

Scaffold iniziale per il gestionale tecnico **GiGEST**.

## Cosa contiene
- Next.js App Router
- Auth.js con provider Google
- Prisma + PostgreSQL
- Schema dati iniziale coerente con AFU
- Pagine placeholder per i moduli principali
- Seed demo con dati minimi

## Prerequisiti
- Node.js 20+
- PostgreSQL disponibile
- Progetto Google Cloud con OAuth configurato

## Avvio locale
1. Copia `.env.example` in `.env`
2. Inserisci i valori reali di database e Google OAuth
3. Installa dipendenze:
   ```bash
   npm install
   ```
4. Genera Prisma Client:
   ```bash
   npm run prisma:generate
   ```
5. Crea il database e applica la prima migration:
   ```bash
   npx prisma migrate dev --name init
   ```
6. Carica dati demo:
   ```bash
   npm run seed
   ```
7. Avvia il progetto:
   ```bash
   npm run dev
   ```

## Primo accesso
- Vai su `http://localhost:3000/login`
- Accedi con Google
- Per test locale, crea nel database un utente con email autorizzata e `status = ACTIVE`
- Per sbloccare l'area admin delle richieste accesso, imposta anche `SEED_ADMIN_PANEL_PASSWORD` e riesegui `npm run seed`

## Nota importante sulla login
Il file `auth.ts` blocca l’accesso se l’email non è presente nella tabella `User` con stato `ACTIVE`.
Gli account non autorizzati vengono registrati in `AccessRequest`.

## Passi successivi consigliati
1. CRUD personale
2. CRUD utenti avanzato / reset password admin pannello
3. CRUD mezzi e attrezzature
4. CRUD commesse
5. Diario cantiere
6. Scadenziario
7. Sync Google Calendar

## Deploy
Vedi `docs/DEPLOY.md`
