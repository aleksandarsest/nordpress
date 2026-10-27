import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isInstalled } from "@/lib/install";
import { getSettings } from "@/lib/options";
import { getViewer } from "@/lib/session";
import { login } from "../actions";

export const metadata: Metadata = { title: "Log In" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<Card className="h-80" />}>
      <LoginForm searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginForm({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  if (!(await isInstalled())) redirect("/install");
  if (await getViewer()) redirect("/admin");
  const params = await searchParams;
  const settings = await getSettings();
  const redirectTo =
    typeof params.redirect_to === "string" ? params.redirect_to : "/admin";

  return (
    <>
      {params.loggedout && (
        <Alert className="mb-4">
          <AlertDescription>You are now logged out.</AlertDescription>
        </Alert>
      )}
      {params.reset && (
        <Alert className="mb-4">
          <AlertDescription>
            Your password has been reset. You can log in now.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent>
          <ActionForm action={login} className="grid gap-4">
            <input type="hidden" name="redirect_to" value={redirectTo} />
            <div className="grid gap-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Label className="font-normal">
              <Checkbox name="remember" /> Remember me
            </Label>
            <SubmitButton pendingLabel="Logging in…">Log In</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <p className="mt-4 flex justify-center gap-4 text-sm">
        {settings.usersCanRegister && (
          <Link href="/register" className="hover:underline">
            Register
          </Link>
        )}
        <Link href="/forgot-password" className="hover:underline">
          Lost your password?
        </Link>
      </p>
    </>
  );
}
