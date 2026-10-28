"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyTwoFactorAction } from "../../actions";

export function TwoFactorForm({ redirectTo }: { redirectTo: string }) {
  const [backup, setBackup] = useState(false);
  return (
    <ActionForm action={verifyTwoFactorAction} className="grid gap-4">
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <input type="hidden" name="backup" value={backup ? "1" : "0"} />
      <div className="grid gap-2">
        <Label htmlFor="code">
          {backup ? "Backup code" : "Code from your authenticator app"}
        </Label>
        <Input
          key={backup ? "backup" : "totp"}
          id="code"
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          {...(backup
            ? { placeholder: "xxxxx-xxxxx" }
            : {
                inputMode: "numeric",
                pattern: "[0-9 ]{6,7}",
                placeholder: "123 456",
              })}
        />
      </div>
      <Label className="font-normal">
        <Checkbox name="trust" /> Don't ask again on this device for 30 days
      </Label>
      <SubmitButton pendingLabel="Checking…">Verify</SubmitButton>
      <button
        type="button"
        onClick={() => setBackup(!backup)}
        className="text-muted-foreground text-sm hover:underline"
      >
        {backup
          ? "Use your authenticator app instead"
          : "Lost your phone? Use a backup code"}
      </button>
    </ActionForm>
  );
}
