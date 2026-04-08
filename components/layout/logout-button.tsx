import { signOut } from "@/auth";
import { clearAdminPanelSession } from "@/lib/admin-panel";

export function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await clearAdminPanelSession();
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className="app-logout-button">
        Logout
      </button>
    </form>
  );
}
