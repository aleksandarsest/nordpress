// The hook engine, kept free of server-only imports so it can be unit tested.
// Handlers are tagged with their plugin so deactivated plugins can be skipped
// without a restart.

type Handler = {
  plugin: string;
  priority: number;
  order: number;
  fn: (...args: never[]) => unknown;
};

export class HookRegistry {
  private actions = new Map<string, Handler[]>();
  private filters = new Map<string, Handler[]>();
  private counter = 0;

  constructor(
    private onError: (
      plugin: string,
      hook: string,
      error: unknown,
    ) => void = () => {},
  ) {}

  add(
    kind: "action" | "filter",
    hook: string,
    plugin: string,
    fn: Handler["fn"],
    priority = 10,
  ) {
    const map = kind === "action" ? this.actions : this.filters;
    const list = map.get(hook) ?? [];
    list.push({ plugin, priority, order: this.counter++, fn });
    // Lower priority runs first; equal priorities keep registration order
    list.sort((a, b) => a.priority - b.priority || a.order - b.order);
    map.set(hook, list);
  }

  async doAction(
    hook: string,
    args: unknown[],
    isActive: (plugin: string) => boolean,
  ) {
    for (const h of this.actions.get(hook) ?? []) {
      if (!isActive(h.plugin)) continue;
      try {
        await (h.fn as (...a: unknown[]) => unknown)(...args);
      } catch (error) {
        this.onError(h.plugin, hook, error);
      }
    }
  }

  async applyFilters<T>(
    hook: string,
    value: T,
    args: unknown[],
    isActive: (plugin: string) => boolean,
  ): Promise<T> {
    let current = value;
    for (const h of this.filters.get(hook) ?? []) {
      if (!isActive(h.plugin)) continue;
      try {
        const next = await (h.fn as (...a: unknown[]) => unknown)(
          current,
          ...args,
        );
        // A filter that forgets to return keeps the previous value
        if (next !== undefined) current = next as T;
      } catch (error) {
        this.onError(h.plugin, hook, error);
      }
    }
    return current;
  }

  has(kind: "action" | "filter", hook: string) {
    return (
      ((kind === "action" ? this.actions : this.filters).get(hook)?.length ??
        0) > 0
    );
  }
}

// Matches "/items/:id" style paths, returning the named parameters.
export function matchPath(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
