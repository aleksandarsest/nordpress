import type { Metadata } from "next";
import { requireViewer } from "@/lib/session";
import { UserForm } from "../../_components/user-form";

export const metadata: Metadata = { title: "Add New User" };

export default async function NewUserPage() {
  await requireViewer("create_users");
  return (
    <>
      <h1 className="mb-2 font-semibold text-2xl tracking-tight">
        Add New User
      </h1>
      <p className="mb-6 text-muted-foreground text-sm">
        Create a brand new user and add them to this site.
      </p>
      <UserForm canChangeRole />
    </>
  );
}
