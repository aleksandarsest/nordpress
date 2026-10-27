import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findAdminPage } from "@/lib/plugins";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Tools" };

// Renders an admin page contributed by an active plugin.
export default async function PluginToolPage({
  params,
}: PageProps<"/admin/tools/[plugin]/[page]">) {
  const { plugin, page } = await params;
  const found = await findAdminPage(plugin, page);
  if (!found) notFound();
  await requireViewer(found.cap);
  const Component = found.component;
  return <Component />;
}
