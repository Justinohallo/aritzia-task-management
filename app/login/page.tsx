import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RedirectIfAuthenticated } from "@/lib/auth/guards";
import { AuthProvider } from "@/lib/auth/provider";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in · Aritzia Task Management",
};

/**
 * `/login` — T-02 (ADR-0001, ADR-0005; `AC-NAV-1`, `AC-AUTH-1`, `AC-AUTH-8`).
 *
 * A signed-in user is sent to `/tasks`; everyone else gets the form. The
 * notice below the form is ADR-0005's requirement that the running
 * application, not only the decision record, says this pattern is not
 * production auth.
 */
export default function LoginPage() {
  return (
    <AuthProvider>
      <RedirectIfAuthenticated>
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-4 sm:p-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
              </CardTitle>
              <CardDescription>Aritzia Task Management</CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm />
            </CardContent>
          </Card>

          <aside role="note" aria-labelledby="non-production-notice" className="text-xs text-muted-foreground">
            <p id="non-production-notice" className="font-medium">
              Not a production login.
            </p>
            <p>
              As the brief specifies, the session is kept in your browser&rsquo;s sessionStorage and the
              credentials are checked only on this page; nothing is verified by a server. Production
              authentication uses an HttpOnly cookie set by a server that has checked the credentials. This
              demo deliberately does not.
            </p>
          </aside>
        </main>
      </RedirectIfAuthenticated>
    </AuthProvider>
  );
}
