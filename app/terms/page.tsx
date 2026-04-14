import Link from "next/link";

export default function TermsPage() {
  return (
    <section className="grid gap-6">
      <div className="card">
        <h1>Termini di utilizzo</h1>
        <p className="muted">Ultimo aggiornamento: 14 aprile 2026</p>

        <p>
          GiGEST e un gestionale tecnico riservato agli utenti autorizzati
          dall'organizzazione che lo amministra.
        </p>

        <h2>Accesso</h2>
        <p>
          L'accesso avviene tramite account Google. L'utente e responsabile
          della correttezza dei dati inseriti e dell'uso del proprio account.
        </p>

        <h2>Google Calendar</h2>
        <p>
          Il collegamento a Google Calendar e facoltativo. Quando viene
          autorizzato, GiGEST crea un calendario secondario dedicato e sincronizza
          le scadenze dell'applicazione su quel calendario.
        </p>

        <h2>Uso consentito</h2>
        <p>
          Il servizio deve essere usato solo per finalita operative interne
          legate a cantieri, risorse, mezzi, commesse e scadenze.
        </p>

        <h2>Supporto</h2>
        <p>
          Per problemi di accesso, sincronizzazione o gestione dati, contatta
          l'amministratore del gestionale GiGEST.
        </p>

        <Link className="button secondary" href="/">
          Torna a GiGEST
        </Link>
      </div>
    </section>
  );
}
