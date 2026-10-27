import { describe, expect, it } from "vitest";
import {
  buildTree,
  type FlatItem,
  flatten,
  moveItem,
  removeItem,
} from "./menu-tree";

// Home, About (> Team, > Jobs), Blog
const items: FlatItem[] = [
  { id: 1, parentId: null, position: 0 },
  { id: 2, parentId: null, position: 1 },
  { id: 3, parentId: 2, position: 2 },
  { id: 4, parentId: 2, position: 3 },
  { id: 5, parentId: null, position: 4 },
];

const shape = (flat: FlatItem[]) =>
  flat.map((i) => `${i.id}${i.parentId ? `<${i.parentId}` : ""}`).join(" ");

describe("menu tree", () => {
  it("builds and flattens depth-first", () => {
    expect(shape(flatten(buildTree(items)))).toBe("1 2 3<2 4<2 5");
  });

  it("moves items up and down within their siblings, with children", () => {
    expect(shape(moveItem(items, 2, "up"))).toBe("2 3<2 4<2 1 5");
    expect(shape(moveItem(items, 3, "down"))).toBe("1 2 4<2 3<2 5");
    expect(shape(moveItem(items, 1, "up"))).toBe("1 2 3<2 4<2 5");
  });

  it("indents under the previous sibling and outdents after the parent", () => {
    expect(shape(moveItem(items, 5, "in"))).toBe("1 2 3<2 4<2 5<2");
    expect(shape(moveItem(items, 4, "in"))).toBe("1 2 3<2 4<3 5");
    expect(shape(moveItem(items, 3, "out"))).toBe("1 2 4<2 3 5");
    expect(shape(moveItem(items, 1, "in"))).toBe("1 2 3<2 4<2 5");
  });

  it("promotes children when an item is removed", () => {
    expect(shape(removeItem(items, 2))).toBe("1 3 4 5");
  });

  it("survives orphans and cycles", () => {
    const broken: FlatItem[] = [
      { id: 1, parentId: 99, position: 0 },
      { id: 2, parentId: 3, position: 1 },
      { id: 3, parentId: 2, position: 2 },
    ];
    expect(flatten(buildTree(broken))).toHaveLength(3);
  });
});
