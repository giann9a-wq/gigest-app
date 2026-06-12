import type { Metadata } from "next";
import { auth } from "@/auth";
import { AppHeader } from "@/components/layout/app-header";
import { LogoutButton } from "@/components/layout/logout-button";
import { getActiveAppUser } from "@/lib/app-user";
import { getHeaderNews } from "@/lib/app-news";
import "./globals.css";

export const metadata: Metadata = {
  title: "GiGEST",
  description: "Gestionale tecnico per diario cantiere, risorse, mezzi, commesse e scadenze.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const [activeAppUser, headerNews] = await Promise.all([
    session?.user?.email ? getActiveAppUser() : Promise.resolve(null),
    getHeaderNews(),
  ]);

  return (
    <html lang="it">
      <body>
        <div className="app-shell">
          <AppHeader
            userLabel={session?.user?.name ?? session?.user?.email ?? null}
            showAdminLink={activeAppUser?.role === "ADMIN"}
            logoutAction={<LogoutButton />}
            news={headerNews}
          />
          <main className="app-main">
            <div className="app-main-inner">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
