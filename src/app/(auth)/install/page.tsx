import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isInstalled } from "@/lib/install";
import { install } from "../actions";

export const metadata: Metadata = { title: "Installation" };

export default function InstallPage() {
  return (
    <Suspense fallback={<Card className="h-96" />}>
      <InstallForm />
    </Suspense>
  );
}

async function InstallForm() {
  if (await isInstalled()) redirect("/login");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to Nordpress</CardTitle>
        <CardDescription>
          Set up your site and its first administrator account. You can change all of this later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={install} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Site Title</Label>
            <Input id="title" name="title" required autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" autoComplete="name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Your Email</Label>
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
          <Label className="font-normal">
            <Checkbox name="blog_public" /> Discourage search engines from
            indexing this site
          </Label>
          <SubmitButton pendingLabel="Installing…">Install</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
