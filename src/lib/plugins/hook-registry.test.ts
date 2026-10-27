import { describe, expect, it, vi } from "vitest";
import { HookRegistry, matchPath } from "./hook-registry";

const all = () => true;

describe("HookRegistry", () => {
  it("runs filters in priority order, then registration order", async () => {
    const hooks = new HookRegistry();
    hooks.add("filter", "title", "a", (v: string) => `${v}-a`, 20);
    hooks.add("filter", "title", "b", (v: string) => `${v}-b`, 5);
    hooks.add("filter", "title", "c", (v: string) => `${v}-c`, 20);
    expect(await hooks.applyFilters("title", "x", [], all)).toBe("x-b-a-c");
  });

  it("passes extra arguments and supports async filters", async () => {
    const hooks = new HookRegistry();
    hooks.add("filter", "n", "a", async (v: number, by: number) => v * by);
    expect(await hooks.applyFilters("n", 3, [4], all)).toBe(12);
  });

  it("skips inactive plugins", async () => {
    const hooks = new HookRegistry();
    const fn = vi.fn();
    hooks.add("action", "saved", "off", fn);
    await hooks.doAction("saved", [], (p) => p !== "off");
    expect(fn).not.toHaveBeenCalled();
  });

  it("isolates failures: other handlers still run and values survive", async () => {
    const onError = vi.fn();
    const hooks = new HookRegistry(onError);
    const after = vi.fn();
    hooks.add("action", "saved", "bad", () => {
      throw new Error("boom");
    });
    hooks.add("action", "saved", "good", after);
    await hooks.doAction("saved", [1], all);
    expect(after).toHaveBeenCalledWith(1);
    expect(onError).toHaveBeenCalledWith("bad", "saved", expect.any(Error));

    hooks.add("filter", "v", "bad", () => {
      throw new Error("boom");
    });
    hooks.add("filter", "v", "noop", () => undefined);
    expect(await hooks.applyFilters("v", "keep", [], all)).toBe("keep");
  });
});

describe("matchPath", () => {
  it("extracts named parameters", () => {
    expect(matchPath("/items/:id", "/items/42")).toEqual({ id: "42" });
    expect(matchPath("/items/:id", "/items")).toBeNull();
    expect(matchPath("/estimate", "/estimate/")).toEqual({});
  });
});
