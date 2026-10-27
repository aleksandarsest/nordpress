import { format } from "date-fns";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAppPasswords } from "@/lib/app-passwords";
import { requireViewer } from "@/lib/session";
import { getUser } from "@/lib/users";
import { NewAppPassword } from "../_components/app-passwords";
import { UserForm } from "../_components/user-form";
import { revokeAppPasswordAction } from "./actions";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const viewer = await requireViewer();
  const [user, passwords] = await Promise.all([
    getUser(viewer.id),
    listAppPasswords(viewer.id),
  ]);
  if (!user) notFound();

  return (
    <>
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">Profile</h1>
      <UserForm user={user} canChangeRole={false} />

      <section className="mt-12 grid max-w-3xl gap-4">
        <div>
          <h2 className="font-semibold text-lg">Application Passwords</h2>
          <p className="text-muted-foreground text-sm">
            Application passwords let apps and scripts use the REST API (
            <code>/wp-json/wp/v2</code>) as you, without your real password.
            Sign in with your email address and the generated password.
          </p>
        </div>
        <NewAppPassword />
        {passwords.length > 0 && (
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Last IP</TableHead>
                  <TableHead>
                    <span className="sr-only">Revoke</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {passwords.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{format(p.createdAt, "MMMM d, yyyy")}</TableCell>
                    <TableCell>
                      {p.lastUsedAt
                        ? format(p.lastUsedAt, "MMMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>{p.lastIp ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <form action={revokeAppPasswordAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <Button type="submit" variant="destructive" size="xs">
                          Revoke
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
