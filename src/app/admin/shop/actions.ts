"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type FormState, formError, optionalId, str } from "@/lib/form";
import { getSettings, SETTINGS_TAG, saveSettings } from "@/lib/options";
import { assertCap } from "@/lib/session";
import { SHOP_TAG, saveProduct, setOrderStatus } from "@/lib/shop";
import { CURRENCIES, parseMoney } from "@/lib/shop/money";

// Editors manage products; orders hold customers' details, so they and the
// shop's settings are for administrators.
const PRODUCTS = "edit_others_pages";
const ORDERS = "manage_options";

export async function saveProductAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  let id: number;
  const existing = optionalId(formData, "id");
  try {
    await assertCap(PRODUCTS);
    const { shopCurrency } = await getSettings();
    const price = parseMoney(str(formData, "price"), shopCurrency);
    if (price === null)
      throw new Error("Enter the price as a number, e.g. 19.90.");
    const stock = str(formData, "stock").trim();
    const saved = await saveProduct(
      {
        name: str(formData, "name"),
        slug: str(formData, "slug"),
        summary: str(formData, "summary"),
        description: str(formData, "description"),
        priceCents: price,
        imageId: optionalId(formData, "image_id"),
        sku: str(formData, "sku"),
        stock: stock === "" ? null : Number(stock),
        shippable: formData.get("shippable") === "on",
        status: str(formData, "status") as "draft" | "active" | "archived",
      },
      existing ?? undefined,
    );
    id = saved.id;
  } catch (error) {
    return formError(error);
  }
  updateTag(SHOP_TAG);
  if (existing) {
    refresh();
    return { message: "Product saved." };
  }
  redirect(`/admin/shop/${id}?created=1`);
}

export async function setOrderStatusAction(formData: FormData) {
  await assertCap(ORDERS);
  const status = z
    .enum(["paid", "fulfilled", "cancelled", "refunded"])
    .parse(str(formData, "status"));
  await setOrderStatus(optionalId(formData, "id") ?? 0, status);
  updateTag(SHOP_TAG);
  refresh();
}

export async function saveShopSettingsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap(ORDERS);
    await saveSettings({
      shopCurrency: z.enum(CURRENCIES).parse(str(formData, "currency")),
      shopPaymentInstructions: str(formData, "payment_instructions")
        .trim()
        .slice(0, 4000),
    });
  } catch (error) {
    return formError(error);
  }
  updateTag(SETTINGS_TAG);
  updateTag(SHOP_TAG);
  return { message: "Settings saved." };
}
