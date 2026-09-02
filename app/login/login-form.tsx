"use client";

/**
 * The login form — T-02 (ADR-0005; `AC-AUTH-1..3`, `AC-AUTH-9`).
 *
 * Validation is the provider's (`login()`); this component renders the
 * outcome. A failure is shown in a `role="alert"` region and the offending
 * field is marked invalid and described by it (`AC-AUTH-3`). The browser's
 * own validation is off (`noValidate`) so the one rule and the one message
 * come from the same place.
 */
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CREDENTIAL_RULE, MIN_PASSWORD_LENGTH, type CredentialField } from "@/lib/auth/credentials";
import { TASKS_PATH } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/provider";

type FormError = { field?: CredentialField; message: string };

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const id = useId();
  const usernameId = `${id}-username`;
  const passwordId = `${id}-password`;
  const errorId = `${id}-error`;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<FormError | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = login({ username, password });
    if (!result.ok) {
      setError({ field: result.field, message: result.message });
      return;
    }
    setError(null);
    router.replace(TASKS_PATH);
  }

  const invalid = (field: CredentialField) => (error?.field === field ? true : undefined);
  const describedBy = (field: CredentialField) => (error?.field === field ? errorId : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-describedby={error ? errorId : undefined}>
      {error ? (
        <Alert variant="destructive" id={errorId}>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor={usernameId}>Username</Label>
        <Input
          id={usernameId}
          name="username"
          type="text"
          autoComplete="username"
          autoFocus
          className="pointer-coarse:h-11"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={invalid("username")}
          aria-describedby={describedBy("username")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={passwordId}>Password</Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={MIN_PASSWORD_LENGTH}
          className="pointer-coarse:h-11"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={invalid("password")}
          aria-describedby={describedBy("password")}
        />
        <p className="text-xs text-muted-foreground">{CREDENTIAL_RULE}</p>
      </div>

      <Button type="submit" className="self-start pointer-coarse:h-11 pointer-coarse:px-6">
        Log in
      </Button>
    </form>
  );
}
