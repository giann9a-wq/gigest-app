import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1>Accesso a GiGEST</h1>
      <p className="muted">
        Accedi con Google. Se il tuo account non è ancora autorizzato, il sistema registrerà
        una richiesta di accesso per approvazione da parte dell’amministratore.
      </p>

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <button className="button" type="submit">
          Continua con Google
        </button>
      </form>
    </div>
  );
}
