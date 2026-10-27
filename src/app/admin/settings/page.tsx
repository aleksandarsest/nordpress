import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS } from "@/lib/capabilities";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { ROLES } from "@/lib/users";
import { saveGeneralAction } from "./actions";

export const metadata: Metadata = { title: "General Settings" };

const DATE_FORMATS = [
  "MMMM d, yyyy",
  "yyyy-MM-dd",
  "MM/dd/yyyy",
  "dd/MM/yyyy",
  "d. MMMM yyyy",
];

export default async function GeneralSettingsPage() {
  await requireViewer("manage_options");
  const s = await getSettings();
  const zones = ["UTC", ...Intl.supportedValuesOf("timeZone")];

  return (
    <>
      <h1 className="mb-6 font-semibold text-2xl tracking-tight">
        General Settings
      </h1>
      <ActionForm action={saveGeneralAction} className="grid max-w-xl gap-5">
        <div className="grid gap-2">
          <Label htmlFor="title">Site Title</Label>
          <Input id="title" name="title" defaultValue={s.title} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tagline">Tagline</Label>
          <Input id="tagline" name="tagline" defaultValue={s.tagline} />
          <span className="text-muted-foreground text-xs">
            In a few words, explain what this site is about.
          </span>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admin_email">Administration Email Address</Label>
          <Input
            id="admin_email"
            name="admin_email"
            type="email"
            defaultValue={s.adminEmail}
            required
          />
        </div>
        <Label className="font-normal">
          <Checkbox
            name="users_can_register"
            defaultChecked={s.usersCanRegister}
          />{" "}
          Anyone can register
        </Label>
        <div className="grid gap-2">
          <Label htmlFor="default_role">New User Default Role</Label>
          <select
            id="default_role"
            name="default_role"
            defaultValue={s.defaultRole}
            className="h-8 rounded-lg border bg-transparent px-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={s.timezone}
            className="h-8 rounded-lg border bg-transparent px-2 text-sm"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <div className="grid gap-2">
            <Label htmlFor="default_language">Site language</Label>
            <Input
              id="default_language"
              name="default_language"
              defaultValue={s.defaultLanguage}
              placeholder="en"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="languages">Translations</Label>
            <Input
              id="languages"
              name="languages"
              defaultValue={s.languages.join(", ")}
              placeholder="de, fr, es"
            />
            <span className="text-muted-foreground text-xs">
              Language codes for translated versions of posts and pages. Each
              gets its own address, like /de/…, and a Translate button in the
              editor.
            </span>
          </div>
        </div>
        <fieldset className="grid gap-2 text-sm">
          <legend className="mb-2 font-medium">Date Format</legend>
          {DATE_FORMATS.map((f) => (
            <label key={f} className="flex items-center gap-2">
              <input
                type="radio"
                name="date_format"
                value={f}
                defaultChecked={s.dateFormat === f}
              />{" "}
              <code>{f}</code>
            </label>
          ))}
        </fieldset>
        <div>
          <SubmitButton>Save Changes</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
