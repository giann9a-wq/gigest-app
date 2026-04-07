# Deploy GiGEST

## 1. Preparazione

- Ruota le credenziali che sono finite nel `.env` locale prima di andare online:
  - password Neon
  - `AUTH_GOOGLE_SECRET`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `AUTH_SECRET`
- Tieni due ambienti distinti:
  - locale
  - produzione

## 2. Database produzione

Usa un database Neon dedicato alla produzione.

1. Crea un nuovo branch/database Neon per `production`.
2. Copia la nuova `DATABASE_URL`.
3. Applica le migration sul database di produzione:

```powershell
$env:DATABASE_URL="postgresql://..."
npx prisma migrate deploy
```

4. Inizializza l'utente admin:

```powershell
$env:DATABASE_URL="postgresql://..."
$env:SEED_ADMIN_EMAIL="tuoadmin@dominio.it"
$env:SEED_ADMIN_FIRST_NAME="Nome"
$env:SEED_ADMIN_LAST_NAME="Cognome"
$env:SEED_DEMO_DATA="false"
npx tsx prisma/seed.ts
```

Nota:
- il seed ora non crea più dati demo se `SEED_DEMO_DATA` non è attivo
- in produzione conviene lasciarlo `false`

## 3. Deploy applicazione

Consiglio:
- frontend/app su Vercel
- database su Neon
- storage documenti su Supabase

### Variabili ambiente da impostare su Vercel

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_TRUST_HOST=true`
- `AUTH_URL=https://tuodominio.it`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_FIRST_NAME`
- `SEED_ADMIN_LAST_NAME`
- `SEED_DEMO_DATA=false`

### Build

Il progetto è già pronto con:

```json
"build": "prisma generate && next build"
```

Per il database produzione usa sempre:

```powershell
npx prisma migrate deploy
```

non `prisma migrate dev`.

## 4. Google Login

Nel progetto Google Cloud aggiorna:

- Authorized JavaScript origins:
  - `https://tuodominio.it`
- Authorized redirect URIs:
  - `https://tuodominio.it/api/auth/callback/google`
  - `https://tuodominio.it/api/google-calendar/callback`

Se usi ancora il dominio Vercel provvisorio, aggiungi anche quello.

## 5. Google Calendar condiviso

Dopo il deploy:

1. accedi con l'utente admin
2. vai su `Scadenziario`
3. collega Google Calendar
4. verifica che venga creato o riusato il calendario condiviso GiGEST

## 6. Supabase Storage

Verifica in produzione:

- bucket `GiGest Documentale` esistente
- service role corretta
- upload e apertura documenti manutenzione funzionanti

## 7. Verifica finale

Checklist minima:

- login Google
- accesso consentito solo agli utenti attivi
- creazione/modifica/eliminazione scadenze manuali
- sync Google Calendar
- caricamento Diario
- apertura schede risorse/mezzi/commesse
- upload documenti manutenzione
- stampa risorse mese
- statistiche risorse/commesse

## 8. Mobile app

Per la versione mobile ti consiglio di non partire subito con un'app nativa separata.

Percorso migliore:

1. rendere l'app web più mobile-friendly
2. valutare una PWA
3. solo dopo decidere se fare una vera app mobile con React Native / Expo

Così riusi logiche, API e autenticazione già costruite.
