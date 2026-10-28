// Waits for the server to answer, then clears every cached page, so a site
// started from a shared template build serves its own content. Run when
// each hosted site starts (platform/systemd/nordpress-site@.service).
const port = process.env.PORT || 3000;
const base = `http://127.0.0.1:${port}`;

for (let attempt = 0; attempt < 120; attempt++) {
  try {
    const res = await fetch(`${base}/api/internal/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.INTERNAL_TOKEN}` },
    });
    if (res.ok) {
      console.log("[refresh] cleared the template's cached pages");
      process.exit(0);
    }
  } catch {
    // Not listening yet
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.error("[refresh] the server didn't come up; cached pages not cleared");
process.exit(1);
