"use client";

import { Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PostStatus } from "@/db/schema";
import { emailPostAction, suggestSubjectsAction } from "../newsletter/actions";

export type NewsletterInfo = {
  subscribers: number;
  sent: {
    status: "queued" | "sending" | "sent" | "cancelled";
    subject: string;
    delivered: number;
    /** Formatted in the site's timezone. */
    at: string;
  } | null;
};

// Lives inside the editor's form: its buttons call actions directly instead
// of submitting the post. Sending asks twice, since it can't be undone.
export function NewsletterCard({
  postId,
  title,
  status,
  membersOnly,
  ai,
  info,
}: {
  postId: number;
  title: string;
  status: PostStatus;
  membersOnly: boolean;
  ai: boolean;
  info: NewsletterInfo;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [audience, setAudience] = useState<"everyone" | "members">("everyone");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const sendable = status === "publish" || status === "future";

  if (info.sent) {
    const { at } = info.sent;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-4" /> Newsletter
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <p>
            {info.sent.status === "sent"
              ? `Emailed to ${info.sent.delivered} subscribers on ${at}.`
              : info.sent.status === "queued"
                ? `Scheduled to be emailed on ${at}.`
                : `Sending: ${info.sent.delivered} delivered so far.`}
          </p>
          <p className="text-muted-foreground">“{info.sent.subject}”</p>
          <Link href="/admin/newsletter" className="underline">
            Newsletter
          </Link>
        </CardContent>
      </Card>
    );
  }

  function run(test: boolean) {
    setNote(null);
    start(async () => {
      const result = await emailPostAction({
        postId,
        subject,
        preheader,
        audience,
        test,
      });
      setConfirming(false);
      if (result.error) setNote({ text: result.error, error: true });
      else {
        setNote({ text: result.message ?? "Done." });
        if (!test) router.refresh();
      }
    });
  }

  function suggest() {
    setNote(null);
    start(async () => {
      const result = await suggestSubjectsAction(postId);
      if (result.error) setNote({ text: result.error, error: true });
      else {
        setIdeas(result.subjects ?? []);
        if (result.preheader && !preheader) setPreheader(result.preheader);
      }
    });
  }

  const recipients =
    audience === "members"
      ? "members who subscribed"
      : `${info.subscribers} subscriber${info.subscribers === 1 ? "" : "s"}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4" /> Newsletter
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="grid gap-1.5">
          <Label htmlFor="nl-subject">Subject</Label>
          <Input
            id="nl-subject"
            value={subject}
            placeholder={title || "The post title"}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
          />
          {ideas.length > 0 && (
            <ul className="grid gap-1">
              {ideas.map((idea) => (
                <li key={idea}>
                  <button
                    type="button"
                    className="text-left underline-offset-4 hover:underline"
                    onClick={() => setSubject(idea)}
                  >
                    {idea}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nl-preheader">Preview text</Label>
          <Input
            id="nl-preheader"
            value={preheader}
            placeholder="The excerpt"
            onChange={(e) => setPreheader(e.target.value)}
            maxLength={200}
          />
        </div>
        {ai && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={suggest}
            className="justify-self-start"
          >
            <Sparkles className="size-3.5" /> Suggest subject lines
          </Button>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="nl-audience">Send to</Label>
          <select
            id="nl-audience"
            value={audience}
            onChange={(e) =>
              setAudience(e.target.value === "members" ? "members" : "everyone")
            }
            className="h-8 rounded-lg border bg-transparent px-2"
          >
            <option value="everyone">All subscribers</option>
            <option value="members">Only members</option>
          </select>
          {membersOnly && audience === "everyone" && (
            <p className="text-muted-foreground text-xs">
              Members get the whole post; everyone else gets the teaser.
            </p>
          )}
        </div>
        {note && (
          <p
            role={note.error ? "alert" : "status"}
            className={note.error ? "text-destructive" : undefined}
          >
            {note.text}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(true)}
          >
            Send me a test
          </Button>
          {!sendable ? (
            <p className="text-muted-foreground text-xs">
              Publish or schedule the post (and save it) to email it.
            </p>
          ) : confirming ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => run(false)}
              >
                Yes, email {recipients}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={pending || info.subscribers === 0}
              onClick={() => setConfirming(true)}
            >
              {status === "future"
                ? "Email when published"
                : "Email to subscribers"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
