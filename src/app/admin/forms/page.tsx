import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { aiConfigured } from "@/lib/ai/client";
import { listForms } from "@/lib/forms";
import { getSettings } from "@/lib/options";
import { requireViewer } from "@/lib/session";
import { ScreenHeader } from "../_components/screen";
import { createFormAction, createFormWithAiAction } from "./actions";

export const metadata: Metadata = { title: "Forms" };

export default async function FormsPage() {
  await requireViewer("edit_others_pages");
  const [forms, settings] = await Promise.all([listForms(), getSettings()]);
  const ai = settings.aiEnabled && aiConfigured();

  return (
    <>
      <ScreenHeader title="Forms" />
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4" /> Describe a form
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ai ? (
              <ActionForm
                action={createFormWithAiAction}
                className="grid gap-3"
              >
                <Label htmlFor="form-description" className="sr-only">
                  What should the form ask?
                </Label>
                <Textarea
                  id="form-description"
                  name="description"
                  rows={3}
                  required
                  placeholder="A quote request for a web design studio: name, email, company, budget range, which services they need and a project description."
                />
                <div>
                  <SubmitButton pendingLabel="Drafting…">
                    Draft with AI
                  </SubmitButton>
                </div>
                <p className="text-muted-foreground text-xs">
                  The draft opens in the builder, where you can change anything
                  before embedding it.
                </p>
              </ActionForm>
            ) : (
              <p className="text-muted-foreground text-sm">
                Turn on AI under Settings → AI and add ANTHROPIC_API_KEY to
                draft forms from a description.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Start from scratch</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createFormAction} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="form-title">Form name</Label>
                <Input
                  id="form-title"
                  name="title"
                  placeholder="Contact us"
                  required
                />
              </div>
              <div>
                <SubmitButton variant="outline" pendingLabel="Creating…">
                  Create Form
                </SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      {forms.length === 0 ? (
        <p className="text-muted-foreground text-sm">No forms yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Form</TableHead>
              <TableHead>Fields</TableHead>
              <TableHead>Responses</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forms.map((form) => (
              <TableRow key={form.id}>
                <TableCell>
                  <Link
                    href={`/admin/forms/${form.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {form.title}
                  </Link>
                </TableCell>
                <TableCell>{form.fields.length}</TableCell>
                <TableCell>
                  <Link
                    href={`/admin/forms/${form.id}/responses`}
                    className="hover:underline"
                  >
                    {form.total}
                  </Link>
                  {form.unread > 0 && (
                    <Badge className="ml-2">{form.unread} new</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {form.settings.open ? (
                    <Badge variant="secondary">Open</Badge>
                  ) : (
                    <Badge variant="outline">Closed</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
