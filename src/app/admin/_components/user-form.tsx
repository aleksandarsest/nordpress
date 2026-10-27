import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Role, User } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/capabilities";
import { ROLES } from "@/lib/users";
import { createUserAction, updateUserAction } from "../users/actions";

export function UserForm({
  user,
  canChangeRole,
}: {
  user?: User;
  canChangeRole: boolean;
}) {
  return (
    <ActionForm
      action={user ? updateUserAction : createUserAction}
      className="grid max-w-xl gap-4"
    >
      {user && <input type="hidden" name="id" value={user.id} />}
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={user?.name} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={user?.email}
          required
        />
      </div>
      {user && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              name="website"
              type="url"
              defaultValue={user.website ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bio">Biographical Info</Label>
            <Textarea
              id="bio"
              name="bio"
              defaultValue={user.bio ?? ""}
              rows={4}
            />
            <span className="text-muted-foreground text-xs">
              Share a little biographical information. This may be shown
              publicly.
            </span>
          </div>
        </>
      )}
      {canChangeRole && (
        <div className="grid gap-2">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            name="role"
            defaultValue={user?.role ?? ("subscriber" satisfies Role)}
            className="h-8 rounded-lg border bg-transparent px-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="password">{user ? "New Password" : "Password"}</Label>
        <Input
          id="password"
          name={user ? "new_password" : "password"}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required={!user}
        />
        {user && (
          <span className="text-muted-foreground text-xs">
            Leave empty to keep the current password.
          </span>
        )}
      </div>
      <div>
        <SubmitButton>{user ? "Update" : "Add New User"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
