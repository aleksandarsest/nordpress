"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import {
  confirmTwoFactorAction,
  deletePasskeyAction,
  disableTwoFactorAction,
  newBackupCodesAction,
  startTwoFactorAction,
  type TwoFactorState,
} from "../profile/actions";

export type PasskeyInfo = {
  id: string;
  name: string | null;
  backedUp: boolean;
  createdAt: string | null;
};

function Note({ state }: { state: TwoFactorState }) {
  if (state?.error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  if (state?.message)
    return (
      <Alert>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  return null;
}

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="grid gap-2">
      <p>
        <strong>Save these backup codes</strong> somewhere safe, like a password
        manager. Each one signs you in once if you lose your phone. They won't
        be shown again.
      </p>
      <pre className="grid grid-cols-2 gap-x-6 rounded-lg bg-muted p-3 font-mono text-sm sm:grid-cols-5">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </pre>
    </div>
  );
}

function PasswordField({ id }: { id: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Your password</Label>
      <Input
        id={id}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="max-w-xs"
      />
    </div>
  );
}

function TwoFactorSetup() {
  const [started, start, starting] = useActionState(startTwoFactorAction, null);
  const [confirmed, confirm, confirming] = useActionState(
    confirmTwoFactorAction,
    null,
  );
  if (!started?.qr)
    return (
      <form action={start} className="grid gap-3">
        <Note state={started} />
        <p>
          Sign in with your password plus a code from an authenticator app
          (1Password, Google Authenticator, Authy…), so a stolen password isn't
          enough.
        </p>
        <PasswordField id="tf-start-password" />
        <Button
          type="submit"
          size="sm"
          disabled={starting}
          className="justify-self-start"
        >
          Set up two-step login
        </Button>
      </form>
    );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div
          className="size-40 shrink-0 rounded-lg bg-white p-1"
          role="img"
          aria-label="QR code for your authenticator app"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated on the server from the authenticator address, no user input
          dangerouslySetInnerHTML={{ __html: started.qr }}
        />
        <div className="grid gap-1">
          <p>1. Scan this with your authenticator app.</p>
          <p className="text-muted-foreground">
            Can't scan? Enter this key instead:
          </p>
          <code className="break-all rounded bg-muted px-2 py-1">
            {started.secret}
          </code>
        </div>
      </div>
      {started.backupCodes && <BackupCodes codes={started.backupCodes} />}
      <form action={confirm} className="grid gap-3">
        <Note state={confirmed} />
        <div className="grid gap-1.5">
          <Label htmlFor="tf-code">2. Enter the 6-digit code it shows</Label>
          <Input
            id="tf-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className="max-w-40"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={confirming}
          className="justify-self-start"
        >
          Turn on two-step login
        </Button>
      </form>
    </div>
  );
}

function TwoFactorManage() {
  const [codes, makeCodes, making] = useActionState(newBackupCodesAction, null);
  const [off, turnOff, turning] = useActionState(disableTwoFactorAction, null);
  return (
    <div className="grid gap-4">
      <p className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-green-600" /> Two-step login is on.
        You'll be asked for a code from your authenticator app when you sign in.
      </p>
      <form action={makeCodes} className="grid gap-3">
        <Note state={codes} />
        {codes?.backupCodes && <BackupCodes codes={codes.backupCodes} />}
        <PasswordField id="tf-codes-password" />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" variant="outline" disabled={making}>
            Make new backup codes
          </Button>
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            disabled={turning}
            formAction={turnOff}
          >
            Turn off two-step login
          </Button>
        </div>
      </form>
      <Note state={off} />
    </div>
  );
}

function Passkeys({ passkeys }: { passkeys: PasskeyInfo[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function add() {
    setError(null);
    setPending(true);
    const result = await authClient.passkey.addPasskey({
      name: guessDeviceName(),
    });
    setPending(false);
    if (result?.error) {
      if (!/cancel|abort|not allowed/i.test(result.error.message ?? ""))
        setError(result.error.message ?? "Couldn't add the passkey.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <p>
        Sign in with your fingerprint, face or device PIN instead of a password.
        Passkeys can't be phished or reused on other sites.
      </p>
      {passkeys.length > 0 && (
        <ul className="grid gap-2">
          {passkeys.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <span className="flex items-center gap-2">
                <KeyRound className="size-4" />
                <span>
                  {p.name || "Passkey"}
                  <span className="text-muted-foreground text-xs">
                    {p.createdAt && ` · added ${p.createdAt}`}
                    {p.backedUp && " · synced"}
                  </span>
                </span>
              </span>
              <form action={deletePasskeyAction}>
                <input type="hidden" name="id" value={p.id} />
                <Button type="submit" size="sm" variant="ghost">
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={add}
        className="justify-self-start"
      >
        <KeyRound className="size-4" />
        {pending ? "Follow your browser's prompt…" : "Add a passkey"}
      </Button>
    </div>
  );
}

// A label for the list, e.g. "Mac" or "iPhone"; people can tell them apart
function guessDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Passkey";
}

export function SecuritySettings({
  twoFactorEnabled,
  passkeys,
}: {
  twoFactorEnabled: boolean;
  passkeys: PasskeyInfo[];
}) {
  return (
    <div className="grid gap-8 text-sm">
      <div className="grid gap-3">
        <h3 className="font-medium text-base">Two-step login</h3>
        {twoFactorEnabled ? <TwoFactorManage /> : <TwoFactorSetup />}
      </div>
      <div className="grid gap-3">
        <h3 className="font-medium text-base">Passkeys</h3>
        <Passkeys passkeys={passkeys} />
      </div>
    </div>
  );
}
