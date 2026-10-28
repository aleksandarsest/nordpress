import { config } from "./config.ts";
import { npSite } from "./host.ts";

// Sites sleep when nobody visits and wake on the next request, so a small
// server can hold more sites than it could run at once. At most
// config.maxAwake run together; waking another puts the least recently
// visited one to sleep.

type State = { last: number; inflight: number; starting?: Promise<string> };
const awake = new Map<string, State>();

async function sleep(sub: string) {
  awake.delete(sub);
  await npSite("stop", sub).catch((error) =>
    console.error(`[wake] couldn't stop ${sub}`, error),
  );
  console.log(`[wake] ${sub} is asleep`);
}

/** Starts a site if it isn't running, and waits until it is. */
export async function wake(sub: string) {
  const known = awake.get(sub);
  if (known) {
    known.last = Date.now();
    if (known.starting) await known.starting;
    return;
  }
  const state: State = { last: Date.now(), inflight: 0 };
  awake.set(sub, state);
  // Make room: the least recently visited idle site sleeps
  const others = [...awake]
    .filter(([name, s]) => name !== sub && !s.starting && s.inflight === 0)
    .sort(([, a], [, b]) => a.last - b.last);
  while (awake.size > config.maxAwake && others.length)
    await sleep((others.shift() as [string, State])[0]);
  state.starting = npSite("start", sub);
  try {
    await state.starting;
    console.log(`[wake] ${sub} is awake`);
  } catch (error) {
    awake.delete(sub);
    throw error;
  } finally {
    state.starting = undefined;
  }
}

/** Counts a request that's being served, so the site isn't stopped under it. */
export function serving(sub: string) {
  const state = awake.get(sub);
  if (state) {
    state.inflight++;
    state.last = Date.now();
  }
  return () => {
    if (state) {
      state.inflight = Math.max(0, state.inflight - 1);
      state.last = Date.now();
    }
  };
}

/** The platform no longer knows the site as running (stopped, removed or crashed). */
export const forget = (sub: string) => awake.delete(sub);

export const awakeSites = () =>
  [...awake].filter(([, s]) => !s.starting).map(([name]) => name);

/** At start, picks up sites that are already running, and puts idle ones to sleep from then on. */
export async function startSleeping(subs: string[]) {
  for (const sub of subs)
    if ((await npSite("status", sub).catch(() => "")) === "active")
      awake.set(sub, { last: Date.now(), inflight: 0 });
  setInterval(() => {
    const cutoff = Date.now() - config.idleMinutes * 60_000;
    for (const [sub, s] of awake)
      if (!s.starting && s.inflight === 0 && s.last < cutoff) void sleep(sub);
  }, 60_000);
}
