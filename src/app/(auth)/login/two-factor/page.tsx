import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Two-step login" };

// Shows the redirect target from the URL, so it renders per request
export const instant = false;

export default async function TwoFactorPage({
  searchParams,
}: PageProps<"/login/two-factor">) {
  const params = await searchParams;
  const redirectTo =
    typeof params.redirect_to === "string" ? params.redirect_to : "/admin";
  return (
    <>
      <Card>
        <CardContent>
          <TwoFactorForm redirectTo={redirectTo} />
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-muted-foreground text-sm">
        <Link href="/login" className="hover:underline">
          ← Back to log in
        </Link>
      </p>
    </>
  );
}
