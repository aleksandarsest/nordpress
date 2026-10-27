import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { insightsSummary } from "@/lib/insights";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Insights" };

const number = (n: number) => new Intl.NumberFormat("en").format(n);
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export default async function InsightsPage() {
  await requireViewer("edit_others_posts");
  const data = await insightsSummary(30);
  const t = data.totals;
  const markdownShare = t.aiCrawls
    ? Math.round((t.machineReadable / t.aiCrawls) * 100)
    : null;
  const empty = t.views + t.aiCrawls + t.searchCrawls === 0;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Insights</h1>
        <p className="text-muted-foreground text-sm">
          The last 30 days: how people find the site, and how AI assistants read
          it and send readers to it. Counted without cookies; no personal data
          is stored, and your team's own visits aren't counted.
        </p>
      </div>

      {empty && (
        <p className="rounded-lg border border-dashed p-6 text-muted-foreground text-sm">
          No visits counted yet. Counting started when this version of Nordpress
          was installed; check back in a day.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Visits from AI answers"
          value={number(t.aiReferrals)}
          note={
            t.views
              ? `${Math.round((t.aiReferrals / t.views) * 100)}% of all visits; search sent ${number(t.search)}`
              : "From ChatGPT, Claude, Perplexity and others"
          }
        />
        <StatTile
          label="Pages read by AI crawlers"
          value={number(t.aiCrawls)}
          note={`Search engines: ${number(t.searchCrawls)}`}
        />
        <StatTile
          label="Read as Markdown or llms.txt"
          value={markdownShare === null ? "–" : `${markdownShare}%`}
          note="Share of AI crawler reads using the clean copies"
        />
        <StatTile
          label="Page views"
          value={number(t.views)}
          note="People, all sources"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ColumnChart
          title="Visits from AI answers per day"
          series={data.series.map((d) => ({ day: d.day, value: d.referrals }))}
          unit="visits"
        />
        <ColumnChart
          title="Pages read by AI crawlers per day"
          series={data.series.map((d) => ({ day: d.day, value: d.crawls }))}
          unit="pages read"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BarList
          title="AI assistants sending visitors"
          rows={data.aiReferrers}
          empty="No visits from AI answers yet."
        />
        <BarList
          title="AI crawlers"
          rows={data.aiCrawlers}
          empty="No AI crawlers have read the site yet."
          footer={
            <>
              Control them under{" "}
              <Link
                href="/admin/settings/reading"
                className="text-primary underline"
              >
                Settings → Reading
              </Link>
              .
            </>
          }
        />
        <BarList
          title="Pages people reach from AI answers"
          rows={data.citedPages}
          empty="None yet."
          links
        />
        <BarList
          title="Pages AI crawlers read most"
          rows={data.crawledPages}
          empty="None yet."
          links
        />
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="font-semibold text-3xl tabular-nums tracking-tight">
          {value}
        </span>
        <span className="text-muted-foreground text-xs">{note}</span>
      </CardContent>
    </Card>
  );
}

// One series of daily counts: columns from a shared baseline, a tooltip on
// hover or focus, and the same numbers as a table.
function ColumnChart({
  title,
  series,
  unit,
}: {
  title: string;
  series: { day: string; value: number }[];
  unit: string;
}) {
  const max = Math.max(1, ...series.map((d) => d.value));
  const total = series.reduce((n, d) => n + d.value, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <div
          role="img"
          aria-label={`${title}: ${number(total)} ${unit} over ${series.length} days, at most ${number(max)} in a day.`}
          className="relative flex h-40 items-end gap-0.5 border-b"
        >
          <span className="absolute top-0 left-0 text-muted-foreground text-xs tabular-nums">
            {number(max)}
          </span>
          {series.map((d) => (
            <div
              key={d.day}
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <div
                className="w-full max-w-6 rounded-t-[4px] bg-[var(--chart-series-1)] group-hover:opacity-80"
                style={{
                  height: `${(d.value / max) * 100}%`,
                  minHeight: d.value ? 2 : 0,
                }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-sm group-hover:block">
                {shortDay(d.day)}:{" "}
                <span className="font-semibold tabular-nums">
                  {number(d.value)}
                </span>{" "}
                {unit}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-muted-foreground text-xs">
          <span>{shortDay(series[0].day)}</span>
          <span>{shortDay(series[series.length - 1].day)}</span>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Show as a table
          </summary>
          <table className="mt-2 w-full">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-normal">Day</th>
                <th className="text-right font-normal">{unit}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((d) => (
                <tr key={d.day}>
                  <td>{shortDay(d.day)}</td>
                  <td className="text-right tabular-nums">{number(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </CardContent>
    </Card>
  );
}

// A ranked list with its numbers written out; the bar only adds the shape.
function BarList({
  title,
  rows,
  empty,
  links,
  footer,
}: {
  title: string;
  rows: { label: string; hits: number }[];
  empty: string;
  links?: boolean;
  footer?: React.ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.hits));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{empty}</p>
        ) : (
          <ol className="grid gap-2.5">
            {rows.map((r) => (
              <li key={r.label} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  {links ? (
                    <a
                      href={r.label}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate hover:underline"
                    >
                      {r.label}
                    </a>
                  ) : (
                    <span className="truncate">{r.label}</span>
                  )}
                  <span className="text-muted-foreground tabular-nums">
                    {number(r.hits)}
                  </span>
                </div>
                <div
                  className="h-2 rounded-r-[4px] bg-[var(--chart-series-1)]"
                  style={{ width: `${(r.hits / max) * 100}%` }}
                />
              </li>
            ))}
          </ol>
        )}
        {footer && <p className="text-muted-foreground text-xs">{footer}</p>}
      </CardContent>
    </Card>
  );
}
