import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { CURRENCIES } from "@/lib/shop/money";
import { stripeConfigured } from "@/lib/shop/stripe";
import { siteUrl } from "@/lib/site-url";
import { saveShopSettingsAction } from "../actions";

export const metadata: Metadata = { title: "Shop Settings" };

export default async function ShopSettingsPage() {
  await requireViewer("manage_options");
  const s = await getSettings();
  const stripe = stripeConfigured();
  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">
        Shop settings
      </h1>
      <ActionForm
        action={saveShopSettingsAction}
        className="grid gap-6 text-sm"
      >
        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor="currency">Currency</Label>
          <select
            id="currency"
            name="currency"
            defaultValue={s.shopCurrency}
            className="h-9 rounded-lg border bg-transparent px-2"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-xs">
            Change it before your first sale; existing prices aren't converted.
          </span>
        </div>
        <section className="grid gap-2">
          <h2 className="font-semibold text-base">Payments</h2>
          {stripe ? (
            <p>
              <strong>Stripe is connected.</strong> Customers pay by card (and
              anything else enabled in your Stripe dashboard) on Stripe's
              checkout page.
            </p>
          ) : (
            <p className="text-muted-foreground">
              To take card payments, set <code>STRIPE_SECRET_KEY</code> and{" "}
              <code>STRIPE_WEBHOOK_SECRET</code>, and add a Stripe webhook to{" "}
              <code>{siteUrl("/api/shop/stripe")}</code> for the{" "}
              <code>checkout.session.completed</code>,{" "}
              <code>checkout.session.async_payment_succeeded</code> and{" "}
              <code>checkout.session.expired</code> events. Until then, orders
              are placed for manual payment with the instructions below.
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="payment_instructions">
              Manual payment instructions
            </Label>
            <Textarea
              id="payment_instructions"
              name="payment_instructions"
              rows={5}
              defaultValue={s.shopPaymentInstructions}
              placeholder={
                "Please transfer the total to:\nAcme d.o.o., IBAN SI56 0000 0000 0000 000\nWe'll ship as soon as it arrives."
              }
            />
            <span className="text-muted-foreground text-xs">
              Shown on the order page and in the order email when Stripe isn't
              used.
            </span>
          </div>
        </section>
        <div>
          <SubmitButton>Save Changes</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
