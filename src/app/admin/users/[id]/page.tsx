import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { hasCap } from "@/lib/capabilities";
import { requireViewer } from "@/lib/session";
import { getUser, listUsers } from "@/lib/users";
import { first } from "../../_components/screen";
import { UserForm } from "../../_components/user-form";
import { deleteUserAction } from "../actions";

export const metadata: Metadata = { title: "Edit User" };

export default async function EditUserPage({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]">) {
  const viewer = await requireViewer("edit_users");
  const { id } = await params;
  if (id === viewer.id) redirect("/admin/profile");
  const user = await getUser(id);
  if (!user) notFound();
  const others = hasCap(viewer, "delete_users")
    ? (await listUsers({})).items.filter((u) => u.id !== id)
    : [];

  return (
    <>
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">
        Edit User {user.name}
      </h1>
      {first((await searchParams).created) && (
        <Alert className="mb-4 max-w-xl">
          <AlertDescription>New user created.</AlertDescription>
        </Alert>
      )}
      <UserForm user={user} canChangeRole={hasCap(viewer, "promote_users")} />
      {hasCap(viewer, "delete_users") && (
        <form
          action={deleteUserAction}
          className="mt-10 grid max-w-xl gap-3 rounded-lg border border-destructive/30 p-4 text-sm"
        >
          <input type="hidden" name="id" value={user.id} />
          <h2 className="font-semibold">Delete User</h2>
          <label htmlFor="reassign">
            What should be done with content owned by this user?
          </label>
          <select
            id="reassign"
            name="reassign"
            className="h-8 rounded-lg border bg-transparent px-2"
          >
            <option value="">Delete all content</option>
            {others.map((u) => (
              <option key={u.id} value={u.id}>
                Attribute all content to {u.name}
              </option>
            ))}
          </select>
          <div>
            <Button type="submit" variant="destructive" size="sm">
              Confirm Deletion
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
