"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MediaPicker } from "../_components/media-picker";
import { saveProductAction } from "./actions";

export type ProductFormValues = {
  id?: number;
  name: string;
  slug: string;
  summary: string;
  description: string;
  price: string;
  sku: string;
  stock: string;
  shippable: boolean;
  status: "draft" | "active" | "archived";
  image: { id: number; url: string } | null;
};

const select = "h-9 w-full rounded-lg border bg-transparent px-2 text-sm";

export function ProductForm({
  product,
  currency,
}: {
  product: ProductFormValues;
  currency: string;
}) {
  const [image, setImage] = useState(product.image);
  const [picking, setPicking] = useState(false);
  return (
    <ActionForm
      action={saveProductAction}
      className="grid gap-6 lg:grid-cols-[1fr_300px]"
    >
      {product.id && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="image_id" value={image?.id ?? ""} />
      <div className="grid content-start gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={product.name}
            required
            className="h-11 text-lg"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="summary">Summary</Label>
          <Textarea
            id="summary"
            name="summary"
            rows={2}
            maxLength={500}
            defaultValue={product.summary}
            placeholder="One or two sentences shown in the shop and in search results."
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={14}
            defaultValue={product.description}
            placeholder={
              "Markdown works here:\n\n## Details\n- 100% cotton\n- Made in Ljubljana"
            }
            className="font-mono text-sm"
          />
          <span className="text-muted-foreground text-xs">
            Markdown. The admin assistant can write or improve descriptions in
            your brand voice.
          </span>
        </div>
      </div>
      <div className="grid content-start gap-4">
        <Card size="sm">
          <CardContent className="grid gap-3 text-sm">
            <div className="grid gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={product.status}
                className={select}
              >
                <option value="draft">Draft (hidden)</option>
                <option value="active">Active (for sale)</option>
                <option value="archived">Archived (hidden)</option>
              </select>
            </div>
            <SubmitButton>Save Product</SubmitButton>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Price and stock</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="grid gap-1.5">
              <Label htmlFor="price">Price ({currency})</Label>
              <Input
                id="price"
                name="price"
                inputMode="decimal"
                defaultValue={product.price}
                required
                placeholder="19.90"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="stock">Stock</Label>
              <Input
                id="stock"
                name="stock"
                type="number"
                min={0}
                defaultValue={product.stock}
                placeholder="Unlimited"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" name="sku" defaultValue={product.sku} />
            </div>
            <Label className="font-normal">
              <Checkbox name="shippable" defaultChecked={product.shippable} />
              Needs shipping
            </Label>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Image</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {image && (
              // biome-ignore lint/performance/noImgElement: a small admin preview
              <img
                src={image.url}
                alt=""
                className="w-full rounded-md border"
              />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPicking(true)}
              >
                {image ? "Change image" : "Choose image"}
              </Button>
              {image && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setImage(null)}
                >
                  Remove
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Address</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 text-sm">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={product.slug}
              placeholder="From the name"
            />
            <span className="text-muted-foreground text-xs">
              /shop/{product.slug || "…"}
            </span>
          </CardContent>
        </Card>
      </div>
      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        title="Product image"
        onSelect={(item) => {
          setImage({ id: item.id, url: item.url });
          setPicking(false);
        }}
      />
    </ActionForm>
  );
}
