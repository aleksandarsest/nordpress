import Link from "next/link";
import { cn } from "@/lib/utils";

export function FormTabs({
  formId,
  current,
  unread,
}: {
  formId: number;
  current: "build" | "responses";
  unread: number;
}) {
  const tab = (active: boolean) =>
    cn(
      "-mb-px border-b-2 px-3 py-2 text-sm",
      active
        ? "border-primary font-medium"
        : "border-transparent text-muted-foreground hover:text-foreground",
    );
  return (
    <nav aria-label="Form" className="mb-6 flex gap-1 border-b">
      <Link
        href={`/admin/forms/${formId}`}
        className={tab(current === "build")}
        aria-current={current === "build" ? "page" : undefined}
      >
        Build
      </Link>
      <Link
        href={`/admin/forms/${formId}/responses`}
        className={tab(current === "responses")}
        aria-current={current === "responses" ? "page" : undefined}
      >
        Responses{unread > 0 && ` (${unread} new)`}
      </Link>
    </nav>
  );
}
