import type { SiteKind, SitePlan } from "./plan";

// Starter sites for when AI isn't set up. Text in [brackets] is for the
// owner to replace; the editor makes that a two-minute job.

const contactFields: SitePlan["contact_form"]["fields"] = [
  {
    label: "Your name",
    type: "text",
    required: true,
    placeholder: "",
    help: "",
    options: [],
  },
  {
    label: "Email",
    type: "email",
    required: true,
    placeholder: "you@example.com",
    help: "",
    options: [],
  },
  {
    label: "Message",
    type: "textarea",
    required: true,
    placeholder: "",
    help: "",
    options: [],
  },
];

const contactPage = (intro: string): SitePlan["pages"][number] => ({
  role: "contact",
  title: "Contact",
  content: `${intro}\n\nFill in the form below and we'll get back to you, usually within [one working day].`,
  in_menu: true,
});

export function templatePlan(kind: SiteKind, title: string): SitePlan {
  const base = {
    title,
    contact_form: { include: true, fields: contactFields },
  };
  switch (kind) {
    case "business":
      return {
        ...base,
        tagline: "[What you do, for whom, in a few words]",
        site_about: `${title} is [a short description of the business: what you offer, where, and who your customers are].`,
        brand_voice:
          "Friendly and professional. Plain words, short sentences.\nSpeak to the customer as “you”.\nNever promise results we can't guarantee.",
        homepage: "page",
        theme: "nord",
        accent: "frost",
        pages: [
          {
            role: "home",
            title: "Home",
            content: `## [Your main promise in one line]\n\n${title} helps [who you serve] with [what you do]. [One sentence on what makes you different.]\n\n### What we offer\n\n- **[Service one]:** [a sentence about it]\n- **[Service two]:** [a sentence about it]\n- **[Service three]:** [a sentence about it]\n\n[Get in touch](/contact) to talk about what you need.`,
            in_menu: true,
          },
          {
            role: "services",
            title: "Services",
            content:
              "## [Service one]\n\n[What it is, who it's for and what the customer gets.]\n\n## [Service two]\n\n[What it is, who it's for and what the customer gets.]\n\n## Prices\n\n[Your prices, or how you quote.]",
            in_menu: true,
          },
          {
            role: "about",
            title: "About",
            content: `${title} was started [when and by whom]. [Why you do this work, in two or three sentences.]\n\n[Who's on the team, and what customers can expect when they work with you.]`,
            in_menu: true,
          },
          contactPage("Have a question or want a quote?"),
        ],
        posts: [],
      };
    case "portfolio":
      return {
        ...base,
        tagline: "[Your craft] by [your name]",
        site_about: `${title} is the portfolio of [your name], a [your craft] based in [place].`,
        brand_voice:
          "Confident but understated. Let the work speak.\nFirst person (“I”).\nShort captions, no buzzwords.",
        homepage: "page",
        theme: "classic",
        accent: "purple",
        pages: [
          {
            role: "home",
            title: "Home",
            content:
              "## Hi, I'm [your name].\n\nI [what you do] for [who you work with].\n\n### Selected work\n\n- **[Project one]:** [one line about it]\n- **[Project two]:** [one line about it]\n- **[Project three]:** [one line about it]\n\nAvailable for new projects from [month]. [Let's talk](/contact).",
            in_menu: true,
          },
          {
            role: "about",
            title: "About",
            content:
              "[Two short paragraphs about you: background, approach, what you care about in your work.]\n\n### Clients and collaborators\n\n[A few names, if you can share them.]",
            in_menu: true,
          },
          contactPage("Want to work together?"),
        ],
        posts: [],
      };
    case "organization":
      return {
        ...base,
        tagline: "[What you stand for, in a few words]",
        site_about: `${title} is [what the organization is, what it does and who it serves].`,
        brand_voice:
          "Warm, welcoming and clear. Write for newcomers.\nSay “we” for the organization and “you” for the reader.\nAvoid jargon and acronyms.",
        homepage: "page",
        theme: "nord",
        accent: "green",
        pages: [
          {
            role: "home",
            title: "Home",
            content:
              "## [Your mission in one sentence]\n\n[Two sentences on what you do and who it's for.]\n\n### Get involved\n\n- **Join us:** [how to become a member or volunteer]\n- **Come along:** [your regular events or meetings]\n- **Support us:** [how to donate or help]\n\n[Contact us](/contact) to find out more.",
            in_menu: true,
          },
          {
            role: "about",
            title: "About us",
            content:
              "[Your story: when and why you started, and what you've done since.]\n\n### Who we are\n\n[The people who run the organization.]",
            in_menu: true,
          },
          contactPage("We'd love to hear from you."),
        ],
        posts: [
          {
            title: "Welcome to our new website",
            excerpt:
              "Our new home on the web, and where to find news from now on.",
            content:
              "We're glad you're here. This is where we'll share news, events and stories from [the organization].\n\n[One or two sentences about what's coming up next.]",
          },
        ],
      };
    default:
      return {
        ...base,
        tagline: "[What you write about]",
        site_about: `${title} is a blog about [your topics], written by [you] for [your readers].`,
        brand_voice:
          "Personal, curious and direct. First person.\nExplain things simply; link to sources.\nNo clickbait headlines.",
        homepage: "posts",
        theme: "classic",
        accent: "frost",
        contact_form: { include: false, fields: contactFields },
        pages: [
          {
            role: "about",
            title: "About",
            content:
              "I'm [your name], and this is where I write about [your topics].\n\n[A few sentences on why you started this blog and what readers can expect.]",
            in_menu: true,
          },
        ],
        posts: [
          {
            title: "Why I'm starting this blog",
            excerpt: "What this blog is about, and what to expect.",
            content:
              "[Open with the moment or question that made you want to write.]\n\nHere I'll write about [your topics]. Expect [how often you'll post] posts on [what kinds of things].\n\n[End with a question to your readers.]",
          },
        ],
      };
  }
}
