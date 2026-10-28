import type { SiteAnswers, SiteKind, SitePlan } from "./plan";

// Starter sites written from the owner's answers, for when AI isn't set up
// (and as the fallback when it is). Every sentence reads as finished text:
// a missing answer leaves its sentence out instead of a [placeholder]. Pure.

type Field = SitePlan["contact_form"]["fields"][number];

const field = (
  label: string,
  type: Field["type"],
  required: boolean,
  extra: Partial<Field> = {},
): Field => ({
  label,
  type,
  required,
  placeholder: "",
  help: "",
  options: [],
  ...extra,
});

const nameEmail = [
  field("Your name", "text", true),
  field("Email", "email", true, { placeholder: "you@example.com" }),
];

const FORMS: Record<SiteKind, Field[]> = {
  business: [
    ...nameEmail,
    field("Phone", "tel", false),
    field("How can we help?", "textarea", true),
  ],
  shop: [
    ...nameEmail,
    field("Order number", "text", false),
    field("Message", "textarea", true),
  ],
  restaurant: [
    ...nameEmail,
    field("Date", "date", true),
    field("Time", "text", true, { placeholder: "19:30" }),
    field("Guests", "number", true),
    field("Anything we should know?", "textarea", false),
  ],
  freelancer: [
    ...nameEmail,
    field("What do you need?", "textarea", true),
    field("Budget", "select", false, {
      options: [
        "Under 1,000",
        "1,000–5,000",
        "5,000–20,000",
        "Over 20,000",
        "Not sure yet",
      ],
    }),
    field("When should it be done?", "text", false),
  ],
  portfolio: [
    ...nameEmail,
    field("Tell me about your project", "textarea", true),
  ],
  blog: [...nameEmail, field("Message", "textarea", true)],
  organization: [
    ...nameEmail,
    field("I'm interested in", "checkbox", false, {
      options: ["Joining", "Volunteering", "Donating", "Something else"],
    }),
    field("Message", "textarea", false),
  ],
  event: [
    field("Your name", "text", true),
    field("Email", "email", true, { placeholder: "you@example.com" }),
    field("Will you come?", "radio", true, {
      options: ["Yes, I'll be there", "Sorry, I can't make it"],
    }),
    field("How many of you?", "number", false),
    field("Dietary needs or a message", "textarea", false),
  ],
};

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const sentence = (s: string) => {
  const t = clean(s);
  if (!t) return "";
  const capital = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};
// Lowercases the first letter, so an answer can continue a sentence
const phrase = (s: string) => {
  const t = clean(s).replace(/[.!]+$/, "");
  return t && t[0] === t[0].toUpperCase() && t[1] !== t[1]?.toUpperCase()
    ? t[0].toLowerCase() + t.slice(1)
    : t;
};
// Paragraphs, leaving out the ones whose answer was empty
const join = (...parts: unknown[]) =>
  parts
    .filter((p): p is string => typeof p === "string" && p !== "")
    .join("\n\n");

const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

/** "Candle — 18.00" → name and price; a line without a price keeps it empty. */
export function splitPrice(line: string) {
  const m = line.match(
    /^(.*?)\s*(?:[—–-]|:)\s*(?:[€$£]\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:€|EUR|USD|GBP|\$|£)?\s*$/i,
  );
  return m
    ? { name: clean(m[1]), price: m[2].replace(",", ".") }
    : { name: clean(line), price: "" };
}

function contactBlock(a: SiteAnswers) {
  const lines = [
    a.location && `**Where:** ${clean(a.location)}`,
    a.phone &&
      `**Phone:** [${clean(a.phone)}](tel:${a.phone.replace(/[^\d+]/g, "")})`,
    a.email && `**Email:** [${clean(a.email)}](mailto:${clean(a.email)})`,
  ].filter(Boolean);
  return lines.length ? lines.join("  \n") : "";
}

function hoursBlock(a: SiteAnswers) {
  const lines = a.hours.split(/\r?\n/).map(clean).filter(Boolean);
  return lines.length ? `### Opening hours\n\n${lines.join("  \n")}` : "";
}

const contactPage = (
  title: string,
  intro: string,
  a: SiteAnswers,
  extra = "",
): SitePlan["pages"][number] => ({
  role: "contact",
  title,
  content: join(intro, contactBlock(a), extra),
  in_menu: true,
});

const aboutPage = (
  title: string,
  fallback: string,
  a: SiteAnswers,
): SitePlan["pages"][number] => ({
  role: "about",
  title,
  content: join(a.about ? sentence(a.about) : fallback),
  in_menu: true,
});

export function templatePlan(kind: SiteKind, answers: SiteAnswers): SitePlan {
  const a = { ...answers, title: clean(answers.title) || "My site" };
  const t = a.title;
  const offer = phrase(a.offer);
  const items = a.items.map(clean).filter(Boolean).slice(0, 12);
  const where = a.location ? ` in ${clean(a.location)}` : "";
  const base = {
    title: t,
    tagline: offer ? sentence(offer).replace(/\.$/, "") : "",
    contact_form: { include: true, fields: FORMS[kind] },
    products: [] as SitePlan["products"],
  };
  const about = (who: string) =>
    join(
      `${t} ${who}${offer ? `: ${offer}` : ""}${where}.`,
      a.about && sentence(a.about),
    );

  switch (kind) {
    case "business":
      return {
        ...base,
        site_about: about("is a business"),
        brand_voice:
          "Friendly and professional. Plain words, short sentences.\nSpeak to the customer as “you”.\nNever promise results we can't guarantee.",
        homepage: "page",
        theme: "studio",
        style: "nordic",
        accent: "frost",
        pages: [
          {
            role: "home",
            title: "Home",
            content: join(
              `## ${offer ? sentence(offer).replace(/\.$/, "") : `Welcome to ${t}`}`,
              a.about && sentence(a.about),
              items.length && `### What we do\n\n${list(items)}`,
              "[Get in touch](/contact) and tell us what you need; we'll reply quickly.",
            ),
            in_menu: true,
          },
          ...(items.length
            ? [
                {
                  role: "services" as const,
                  title: "Services",
                  content: join(
                    ...items.map((i) => `## ${i}`),
                    "Not sure what you need? [Ask us](/contact) and we'll suggest the right option.",
                  ),
                  in_menu: true,
                },
              ]
            : []),
          aboutPage("About", about("is a business"), a),
          contactPage(
            "Contact",
            "Have a question or want a quote? Send us a message and we'll get back to you.",
            a,
            hoursBlock(a),
          ),
        ],
        posts: [],
      };

    case "shop": {
      const products = items.map(splitPrice).map((p) => ({
        name: p.name,
        price: p.price,
        summary: "",
      }));
      return {
        ...base,
        products,
        site_about: about("is an online shop"),
        brand_voice:
          "Warm and helpful, like a good shop assistant.\nDescribe products concretely: what they are, what they're made of, who they're for.\nNo hype.",
        homepage: "page",
        theme: "studio",
        style: "playful",
        accent: "orange",
        pages: [
          {
            role: "home",
            title: "Home",
            content: join(
              `## ${offer ? sentence(offer).replace(/\.$/, "") : `Welcome to ${t}`}`,
              a.about && sentence(a.about),
              "[Browse the shop](/shop) to see everything we have.",
            ),
            in_menu: true,
          },
          aboutPage("About", about("is an online shop"), a),
          {
            role: "other",
            title: "Shipping and returns",
            content: join(
              "## Shipping",
              "We pack every order with care and send it as soon as we can. You'll get an email when it's on its way.",
              "## Returns",
              "Not happy with something? Write to us within 14 days of delivery and we'll sort it out.",
            ),
            in_menu: false,
          },
          contactPage(
            "Contact",
            "Questions about a product or an order? Write to us.",
            a,
          ),
        ],
        posts: [],
      };
    }

    case "restaurant":
      return {
        ...base,
        site_about: about("is a place to eat and drink"),
        brand_voice:
          "Warm and inviting, a little playful.\nTalk about food concretely: ingredients, how it's made.\nKeep it short; people are hungry.",
        homepage: "page",
        theme: "studio",
        style: "bakery",
        accent: "red",
        pages: [
          {
            role: "home",
            title: "Home",
            content: join(
              `## ${offer ? sentence(offer).replace(/\.$/, "") : `Welcome to ${t}`}`,
              a.about && sentence(a.about),
              hoursBlock(a),
              a.location && `Find us at ${clean(a.location)}.`,
              "[Book a table](/reservations), or just drop by.",
            ),
            in_menu: true,
          },
          {
            role: "services",
            title: "Menu",
            content: join(
              items.length ? `## Favourites\n\n${list(items)}` : "## Our menu",
              "The menu changes with the seasons; ask us about today's specials.",
            ),
            in_menu: true,
          },
          aboutPage("About", about("is a place to eat and drink"), a),
          contactPage(
            "Reservations",
            "Book a table below and we'll confirm by email. For groups of more than eight, give us a call.",
            a,
            hoursBlock(a),
          ),
        ],
        posts: [],
      };

    case "freelancer":
      return {
        ...base,
        site_about: about("is a freelancer"),
        brand_voice:
          "Confident, clear and personal. First person (“I”).\nShow how you work and what the client gets.\nNo buzzwords.",
        homepage: "page",
        theme: "studio",
        style: "tech",
        accent: "frost",
        pages: [
          {
            role: "home",
            title: "Home",
            content: join(
              `## ${offer ? `I help with ${offer}` : `Hi, I'm ${t}`}`,
              a.about && sentence(a.about),
              items.length && `### How I can help\n\n${list(items)}`,
              "[Tell me about your project](/work-with-me); I'll reply within a working day.",
            ),
            in_menu: true,
          },
          aboutPage("About", about("is a freelancer"), a),
          contactPage(
            "Work with me",
            "Tell me what you need, and I'll get back to you with how I'd approach it.",
            a,
          ),
        ],
        posts: [],
      };

    case "portfolio":
      return {
        ...base,
        site_about: about("is a portfolio"),
        brand_voice:
          "Confident but understated. Let the work speak.\nFirst person (“I”).\nShort captions, no buzzwords.",
        homepage: "page",
        theme: "studio",
        style: "noir",
        accent: "purple",
        pages: [
          {
            role: "home",
            title: "Home",
            content: join(
              `## ${t}`,
              offer && sentence(offer),
              a.about && sentence(a.about),
              items.length && `### Selected work\n\n${list(items)}`,
              "[Let's talk](/contact) about your project.",
            ),
            in_menu: true,
          },
          aboutPage("About", about("is a portfolio"), a),
          contactPage(
            "Contact",
            "Want to work together? Send me a message.",
            a,
          ),
        ],
        posts: [],
      };

    case "organization":
      return {
        ...base,
        site_about: about("is an organization"),
        brand_voice:
          "Warm, welcoming and clear. Write for newcomers.\nSay “we” for the organization and “you” for the reader.\nAvoid jargon and acronyms.",
        homepage: "page",
        theme: "studio",
        style: "fresh",
        accent: "green",
        pages: [
          {
            role: "home",
            title: "Home",
            content: join(
              `## ${offer ? sentence(offer).replace(/\.$/, "") : `Welcome to ${t}`}`,
              a.about && sentence(a.about),
              items.length && `### What we do\n\n${list(items)}`,
              a.location && `We meet in ${clean(a.location)}.`,
              "[Get in touch](/get-involved) to join, volunteer or support us.",
            ),
            in_menu: true,
          },
          aboutPage("About us", about("is an organization"), a),
          contactPage("Get involved", "We'd love to hear from you.", a),
        ],
        posts: [
          {
            title: "Welcome to our new website",
            excerpt: "Our new home on the web, and where to find our news.",
            content: `We're glad you're here. This is where ${t} will share news, events and stories. Check back soon, or [get in touch](/get-involved).`,
          },
        ],
      };

    case "event": {
      const when = clean(a.date);
      return {
        ...base,
        site_about: join(
          `${t}${offer ? `: ${offer}` : ""}${when ? `, ${when}` : ""}${where}.`,
          a.about && sentence(a.about),
        ),
        brand_voice:
          "Joyful and warm, but practical.\nMake times, places and what to bring easy to find.\nSpeak to guests as “you”.",
        homepage: "page",
        theme: "studio",
        style: "elegant",
        accent: "purple",
        contact_form: { include: true, fields: FORMS.event },
        pages: [
          {
            role: "home",
            title: "Home",
            content: join(
              `## ${t}`,
              [when, clean(a.location)].filter(Boolean).join(" · "),
              offer && sentence(offer),
              a.about && sentence(a.about),
              "[Let us know if you're coming](/rsvp).",
            ),
            in_menu: true,
          },
          {
            role: "other",
            title: "Programme",
            content: join(
              items.length
                ? list(items)
                : "The full programme will follow soon.",
              a.location &&
                `### Getting there\n\nThe event takes place at ${clean(a.location)}.`,
            ),
            in_menu: true,
          },
          contactPage(
            "RSVP",
            "Please let us know whether you can come, so we can plan.",
            a,
          ),
        ],
        posts: [],
      };
    }

    default:
      return {
        ...base,
        tagline: offer ? `About ${offer}` : "",
        site_about: about("is a blog"),
        brand_voice:
          "Personal, curious and direct. First person.\nExplain things simply; link to sources.\nNo clickbait headlines.",
        homepage: "posts",
        theme: "studio",
        style: "newspaper",
        accent: "frost",
        contact_form: { include: false, fields: FORMS.blog },
        pages: [
          aboutPage(
            "About",
            join(
              `Welcome to ${t}${offer ? `, where I write about ${offer}` : ""}.`,
              items.length && `You'll find posts on:\n\n${list(items)}`,
            ),
            a,
          ),
        ],
        posts: [
          {
            title: `Welcome to ${t}`,
            excerpt: offer
              ? `What this blog is about: ${offer}.`
              : "What this blog is about, and what to expect.",
            content: join(
              `Welcome! This is where I'll write${offer ? ` about ${offer}` : ""}.`,
              items.length &&
                `Coming up: posts on ${items.slice(0, 3).join(", ")}${items.length > 3 ? " and more" : ""}.`,
              "Thanks for reading. If something here is useful to you, I'd love to hear about it.",
            ),
          },
        ],
      };
  }
}
