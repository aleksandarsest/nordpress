import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/lib/options";
import { register } from "../actions";

export const metadata: Metadata = { title: "Registration Form" };

export default async function RegisterPage({
  searchParams,
}: PageProps<"/register">) {
  const settings = await getSettings();
  if (!settings.usersCanRegister) notFound();
  const { redirect_to } = await searchParams;

  return (
    <>
      <Card>
        <CardContent>
          <ActionForm action={register} className="grid gap-4">
            {typeof redirect_to === "string" && (
              <input type="hidden" name="redirect_to" value={redirect_to} />
            )}
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <SubmitButton pendingLabel="Registering…">Register</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
