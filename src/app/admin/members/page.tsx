import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { MembershipPlan } from "@/db/schema";
import { formatInZone } from "@/lib/dates";
import { listMembers, listPlans } from "@/lib/members";
import { membershipGrantsAccess } from "@/lib/members/access";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { centsToInput, formatMoney } from "@/lib/shop/money";
import { stripeConfigured } from "@/lib/shop/stripe";
import { grantAction, revokeAction, savePlanAction } from "./actions";

export const metadata: Metadata = { title: "Members" };

export default async function MembersAdminPage() {
  await requireViewer("manage_options");
  const [plans, members, settings] = await Promise.all([
    listPlans(),
    listMembers(),
    getSettings(),
  ]);
  const stripe = stripeConfigured();
  const activeCount = members.filter((m) =>
    membershipGrantsAccess(m.membership),
  ).length;

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Members</h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          Mark posts and pages <strong>Members only</strong> in the editor;
          members read them in full, everyone else sees the excerpt and an
          invitation to join at <code>/members</code>. Members-only content is
          also kept out of feeds, the API, AI crawler copies and the site chat.
        </p>
      </div>

      <section className="grid gap-4">
        <h2 className="font-semibold text-lg">Plans</h2>
        {!stripe && (
          <p className="text-muted-foreground text-sm">
            Free plans work now. Paid plans need Stripe: set{" "}
            <code>STRIPE_SECRET_KEY</code> and{" "}
            <code>STRIPE_WEBHOOK_SECRET</code>, and add the{" "}
            <code>customer.subscription.updated</code> and <code>.deleted</code>{" "}
            events to the webhook. Until then they stay hidden.
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map((plan) => (
            <PlanForm
              key={plan.id}
              plan={plan}
              currency={settings.shopCurrency}
            />
          ))}
          <PlanForm currency={settings.shopCurrency} />
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="font-semibold text-lg">
          Members{" "}
          <span className="font-normal text-muted-foreground text-sm">
            ({activeCount} active)
          </span>
        </h2>
        <ActionForm
          action={grantAction}
          className="flex flex-wrap items-end gap-2 text-sm"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="grant-email">Give someone a membership</Label>
            <Input
              id="grant-email"
              name="email"
              type="email"
              placeholder="Their account email"
              required
              className="h-8 w-64"
            />
          </div>
          <select
            name="plan_id"
            aria-label="Plan"
            className="h-8 rounded-lg border bg-transparent px-2"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <SubmitButton
            size="sm"
            variant="outline"
            disabled={plans.length === 0}
          >
            Grant
          </SubmitButton>
        </ActionForm>
        {members.length === 0 ? (
          <p className="text-muted-foreground text-sm">No members yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Since</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map(({ membership: m, planName, userName, email }) => {
                const active = membershipGrantsAccess(m);
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      {userName}
                      <span className="block text-muted-foreground text-xs">
                        {email}
                      </span>
                    </TableCell>
                    <TableCell>
                      {planName ?? "—"}
                      <span className="block text-muted-foreground text-xs">
                        {m.source === "stripe"
                          ? "Paid (Stripe)"
                          : m.source === "admin"
                            ? "Granted"
                            : "Free"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={active ? "secondary" : "outline"}>
                        {!active
                          ? "Ended"
                          : m.status === "past_due"
                            ? "Payment failed"
                            : m.currentPeriodEnd
                              ? "Ending"
                              : "Active"}
                      </Badge>
                      {m.currentPeriodEnd && active && (
                        <span className="block text-muted-foreground text-xs">
                          until{" "}
                          {formatInZone(
                            m.currentPeriodEnd,
                            settings.timezone,
                            settings.dateFormat,
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatInZone(
                        m.createdAt,
                        settings.timezone,
                        settings.dateFormat,
                      )}
                    </TableCell>
                    <TableCell>
                      {active && m.source !== "stripe" && (
                        <form action={revokeAction}>
                          <input
                            type="hidden"
                            name="user_id"
                            value={m.userId}
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="xs"
                            className="text-destructive"
                          >
                            End
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function PlanForm({
  plan,
  currency,
}: {
  plan?: MembershipPlan;
  currency: string;
}) {
  const id = plan?.id ?? "new";
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {plan ? plan.name : "New plan"}
          {plan && (
            <span className="ml-2 font-normal text-muted-foreground">
              {plan.priceCents
                ? `${formatMoney(plan.priceCents, currency)} / ${plan.interval}`
                : "Free"}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ActionForm action={savePlanAction} className="grid gap-3 text-sm">
          {plan && <input type="hidden" name="id" value={plan.id} />}
          <div className="grid gap-1.5">
            <Label htmlFor={`plan-name-${id}`}>Name</Label>
            <Input
              id={`plan-name-${id}`}
              name="name"
              defaultValue={plan?.name}
              required
              className="h-8"
              placeholder="Supporter"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`plan-price-${id}`}>Price ({currency})</Label>
              <Input
                id={`plan-price-${id}`}
                name="price"
                inputMode="decimal"
                defaultValue={
                  plan?.priceCents
                    ? centsToInput(plan.priceCents, currency)
                    : ""
                }
                placeholder="0 = free"
                className="h-8 w-28"
              />
            </div>
            <select
              name="interval"
              aria-label="Billing interval"
              defaultValue={plan?.interval ?? "month"}
              className="h-8 rounded-lg border bg-transparent px-2"
            >
              <option value="month">per month</option>
              <option value="year">per year</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`plan-description-${id}`}>What members get</Label>
            <Textarea
              id={`plan-description-${id}`}
              name="description"
              rows={2}
              defaultValue={plan?.description}
            />
          </div>
          <Label className="font-normal">
            <Checkbox name="active" defaultChecked={plan?.active ?? true} />{" "}
            Open for new members
          </Label>
          <div>
            <SubmitButton size="sm" variant={plan ? "outline" : "default"}>
              {plan ? "Save plan" : "Add plan"}
            </SubmitButton>
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
