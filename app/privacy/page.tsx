import Link from "next/link";

export default function PrivacyPage() {
  return (
    <section className="grid gap-6">
      <div className="card">
        <h1>Informativa privacy</h1>
        <p className="muted">Ultimo aggiornamento: 14 aprile 2026</p>

        <p>
          GiGEST usa l'accesso Google per autenticare gli utenti autorizzati e,
          quando l'utente sceglie di collegare Google Calendar, per creare un
          calendario secondario dedicato a GiGEST e sincronizzare le scadenze
          operative inserite nell'applicazione.
        </p>

        <h2>Dati trattati</h2>
        <p>
          L'applicazione puo trattare nome, email dell'account Google, dati
          dell'utente GiGEST, scadenze, descrizioni operative, date e orari degli
          eventi sincronizzati sul calendario GiGEST.
        </p>

        <h2>Uso dei dati Google</h2>
        <p>
          GiGEST usa i permessi Google Calendar solo per creare il calendario
          GiGEST nell'account dell'utente e per creare, aggiornare o rimuovere
          gli eventi gestiti da GiGEST su quel calendario. L'applicazione non
          usa questi dati per pubblicita, profilazione o rivendita a terzi.
        </p>

        <h2>Conservazione e revoca</h2>
        <p>
          I token di collegamento vengono conservati per mantenere attiva la
          sincronizzazione. L'utente puo revocare l'accesso dall'account Google
          o richiedere la rimozione del collegamento e dei dati associati
          all'amministratore GiGEST.
        </p>

        <h2>Contatti</h2>
        <p>
          Per richieste su privacy, accesso o cancellazione dei dati, contatta
          l'amministratore del gestionale GiGEST.
        </p>

        <Link className="button secondary" href="/">
          Torna a GiGEST
        </Link>
      </div>
    </section>
  );
}
