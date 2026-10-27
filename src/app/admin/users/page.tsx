import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasCap, ROLE_LABELS } from "@/lib/capabilities";
import { requireViewer } from "@/lib/session";
import { isRole, listUsers, ROLES } from "@/lib/users";
import {
  FilterLinks,
  first,
  ScreenHeader,
  withParams,
} from "../_components/screen";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  const viewer = await requireViewer("list_users");
  const params = await searchParams;
  const roleParam = first(params.role) ?? "";
  const role = isRole(roleParam) ? roleParam : undefined;
  const search = first(params.s) ?? "";
  const { items, counts } = await listUsers({ role, search });
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <>
      <ScreenHeader
        title="Users"
        action={
          hasCap(viewer, "create_users")
            ? { label: "Add New User", href: "/admin/users/new" }
            : undefined
        }
      />
      {first(params.deleted) && (
        <Alert className="mb-4">
          <AlertDescription>User deleted.</AlertDescription>
        </Alert>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <FilterLinks
          links={[
            { label: "All", href: "/admin/users", count: total, active: !role },
            ...ROLES.filter((r) => counts[r]).map((r) => ({
              label: ROLE_LABELS[r],
              href: withParams("/admin/users", { role: r }),
              count: counts[r],
              active: role === r,
            })),
          ]}
        />
        <form>
          <Input
            name="s"
            defaultValue={search}
            placeholder="Search users"
            className="h-8 w-56"
          />
        </form>
      </div>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Posts</TableHead>
              <TableHead>Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <Link
                    href={
                      u.id === viewer.id
                        ? "/admin/profile"
                        : `/admin/users/${u.id}`
                    }
                    className="font-medium text-primary hover:underline"
                  >
                    {u.name}
                  </Link>
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                <TableCell className="text-right">{u.postCount}</TableCell>
                <TableCell className="text-muted-foreground">
                  {format(u.createdAt, "yyyy/MM/dd")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
