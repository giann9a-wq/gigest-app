import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

function getErrorMessage(error?: string) {
  if (error === "AccessDenied") {
    return "Account Google non ancora abilitato: la richiesta di accesso e stata registrata e resta in attesa dell'approvazione admin.";
  }

  return "";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const errorMessage = getErrorMessage(params.error);

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1>Accesso a GiGEST</h1>
      <p className="muted">
        Accedi con Google. Se il tuo account non e ancora autorizzato, il sistema registrera una
        richiesta di accesso per approvazione da parte dell&apos;amministratore.
      </p>

      {errorMessage ? <div className="scad-error">{errorMessage}</div> : null}

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
