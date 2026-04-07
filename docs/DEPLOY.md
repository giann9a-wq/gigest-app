# Deploy GiGEST

## Stack consigliato
- Frontend/backend: Vercel
- Database: PostgreSQL gestito
- Auth: Google OAuth
- Storage allegati: bucket esterno (fase successiva)

## Procedura sintetica
1. Pubblica il repository su GitHub
2. Importa il repository su Vercel
3. Configura le variabili ambiente
4. Collega il database PostgreSQL
5. Esegui le migration Prisma
6. Configura gli URL OAuth nel progetto Google Cloud
7. Pubblica

## Variabili ambiente richieste
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_TRUST_HOST`
- `AUTH_URL` (se necessario)

## URL OAuth da impostare
In Google Cloud devi configurare almeno:
- Origine JavaScript autorizzata del dominio pubblico
- Redirect URI OAuth di Auth.js

Per produzione, l’URL di callback sarà tipicamente:
`https://TUO-DOMINIO/api/auth/callback/google`

## Migrazioni in produzione
Dopo il primo deploy:
```bash
npx prisma migrate deploy
```

## Multiutente
L’app è multiutente per definizione se:
- è pubblicata su un dominio raggiungibile da tutti gli utenti autorizzati
- usa un database condiviso
- usa autenticazione Google
- ogni utente accede con il proprio account
