import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Lost Password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Lost your password?</CardTitle>
          <CardDescription>
            Enter your email address and we'll send you a link to choose a new
            one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={requestPasswordReset} className="grid gap-4">
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
            <SubmitButton pendingLabel="Sending…">
              Get New Password
            </SubmitButton>
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
