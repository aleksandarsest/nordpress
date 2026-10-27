import Link from "next/link";
import { getSettings } from "@/lib/options";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const settings = await getSettings();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-16">
      <Link href="/" className="font-semibold text-2xl tracking-tight">
        {settings.title}
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <Link href="/" className="text-muted-foreground text-sm hover:underline">
        ← Go to {settings.title}
      </Link>
    </main>
  );
}
