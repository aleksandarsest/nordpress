import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "../actions";

export const metadata: Metadata = {
  title: "Reset Password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={<Card className="h-72" />}>
      <ResetForm searchParams={searchParams} />
    </Suspense>
  );
}

async function ResetForm({
  searchParams,
}: Pick<PageProps<"/reset-password">, "searchParams">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  if (!token || params.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This reset link is invalid or has expired.{" "}
          <Link href="/forgot-password" className="underline">
            Request a new one
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
      </CardHeader>
      <CardContent>
        <ActionForm action={resetPassword} className="grid gap-4">
          <input type="hidden" name="token" value={token} />
          <div className="grid gap-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <SubmitButton pendingLabel="Saving…">Save Password</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
