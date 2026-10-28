"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function PasskeyButton({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setError(null);
    setPending(true);
    const result = await authClient.signIn.passkey();
    setPending(false);
    if (result?.error) {
      // Closing the browser's passkey prompt isn't worth an error
      if (!/cancel|abort|not allowed/i.test(result.error.message ?? ""))
        setError("That passkey didn't work. Try again or use your password.");
      return;
    }
    // Same rule as the password form: only paths on this site
    router.push(/^\/(?![/\\])/.test(redirectTo) ? redirectTo : "/admin");
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={signIn}
      >
        <KeyRound className="size-4" />
        {pending ? "Waiting for your passkey…" : "Log in with a passkey"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
