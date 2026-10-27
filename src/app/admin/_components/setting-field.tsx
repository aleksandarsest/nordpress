import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SettingField } from "@/lib/plugins/types";

// One input for a declared settings field (plugin settings, theme options).
export function SettingFieldInput({
  field,
  value,
}: {
  field: SettingField;
  value: string | number | boolean | undefined;
}) {
  const id = `field-${field.key}`;
  const help = field.help && (
    <span className="text-muted-foreground text-xs">{field.help}</span>
  );

  if (field.type === "checkbox") {
    return (
      <div className="grid gap-1">
        <Label className="font-normal">
          <Checkbox name={field.key} defaultChecked={Boolean(value)} />{" "}
          {field.label}
        </Label>
        {help}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{field.label}</Label>
      {field.type === "textarea" ? (
        <Textarea
          id={id}
          name={field.key}
          defaultValue={String(value ?? "")}
          rows={field.rows ?? 4}
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          name={field.key}
          defaultValue={String(value ?? "")}
          className="h-8 rounded-lg border bg-transparent px-2"
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          name={field.key}
          type={field.type}
          defaultValue={String(value ?? "")}
          {...(field.type === "number"
            ? { min: field.min, max: field.max }
            : {})}
        />
      )}
      {help}
    </div>
  );
}
