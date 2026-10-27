"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAppPasswordAction } from "../profile/actions";

export function NewAppPassword() {
  const [state, action, pending] = useActionState(
    createAppPasswordAction,
    null,
  );
  return (
    <div className="grid gap-3">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.secret && (
        <Alert>
          <AlertDescription className="grid gap-2">
            <span>
              Your new password for <strong>{state.name}</strong> is:
            </span>
            <code className="select-all rounded bg-muted px-2 py-1 font-mono text-base tracking-wider">
              {state.secret}
            </code>
            <span>
              Be sure to save this in a safe location. You will not be able to
              retrieve it.
            </span>
          </AlertDescription>
        </Alert>
      )}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <label htmlFor="app-password-name" className="grid gap-1.5 text-sm">
          <span className="font-medium">New Application Password Name</span>
          <Input
            id="app-password-name"
            name="name"
            required
            className="w-64"
            placeholder="e.g. Mobile app"
          />
        </label>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Creating…" : "Add New Application Password"}
        </Button>
      </form>
    </div>
  );
}
