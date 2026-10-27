// Pure helpers for nested menus: items are stored flat (parentId + position)
// and edited as a tree. Kept free of server imports so they can be tested.

export type FlatItem = {
  id: number;
  parentId: number | null;
  position: number;
};
export type TreeNode<T extends FlatItem = FlatItem> = T & {
  children: TreeNode<T>[];
};
export type Move = "up" | "down" | "in" | "out";

export function buildTree<T extends FlatItem>(items: T[]): TreeNode<T>[] {
  const nodes = new Map(
    items.map((i) => [i.id, { ...i, children: [] as TreeNode<T>[] }]),
  );
  const roots: TreeNode<T>[] = [];
  for (const item of [...items].sort(
    (a, b) => a.position - b.position || a.id - b.id,
  )) {
    const node = nodes.get(item.id) as TreeNode<T>;
    const parent = item.parentId ? nodes.get(item.parentId) : undefined;
    // Orphans (parent deleted) and cycles fall back to the top level
    if (parent && !isAncestor(nodes, item.id, parent.id))
      parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function isAncestor(nodes: Map<number, FlatItem>, id: number, of: number) {
  let current: number | null | undefined = of;
  const seen = new Set<number>();
  while (current && !seen.has(current)) {
    if (current === id) return true;
    seen.add(current);
    current = nodes.get(current)?.parentId;
  }
  return false;
}

// Depth-first order, renumbering positions and parents to match the tree.
export function flatten<T extends FlatItem>(tree: TreeNode<T>[]): FlatItem[] {
  const out: FlatItem[] = [];
  const walk = (nodes: TreeNode<T>[], parentId: number | null) => {
    for (const node of nodes) {
      out.push({ id: node.id, parentId, position: out.length });
      walk(node.children, node.id);
    }
  };
  walk(tree, null);
  return out;
}

// Finds the sibling list containing `id`.
function locate<T extends FlatItem>(
  tree: TreeNode<T>[],
  id: number,
  parent: TreeNode<T> | null = null,
): { list: TreeNode<T>[]; index: number; parent: TreeNode<T> | null } | null {
  const index = tree.findIndex((n) => n.id === id);
  if (index >= 0) return { list: tree, index, parent };
  for (const node of tree) {
    const found = locate(node.children, id, node);
    if (found) return found;
  }
  return null;
}

// Moves an item (with its children) and returns the new flat order.
export function moveItem<T extends FlatItem>(
  items: T[],
  id: number,
  move: Move,
): FlatItem[] {
  const tree = buildTree(items);
  const at = locate(tree, id);
  if (!at) return flatten(tree);
  const { list, index } = at;
  const [node] = list.splice(index, 1);

  switch (move) {
    case "up":
      list.splice(Math.max(0, index - 1), 0, node);
      break;
    case "down":
      list.splice(Math.min(list.length, index + 1), 0, node);
      break;
    case "in": {
      // Becomes the last child of the item above it
      const previous = list[index - 1];
      if (previous) previous.children.push(node);
      else list.splice(index, 0, node);
      break;
    }
    case "out": {
      if (!at.parent) {
        list.splice(index, 0, node);
        break;
      }
      // Becomes the sibling right after its former parent
      const outer = locate(tree, at.parent.id);
      if (outer) outer.list.splice(outer.index + 1, 0, node);
      break;
    }
  }
  return flatten(tree);
}

// Removes an item; its children move up to take its place.
export function removeItem<T extends FlatItem>(
  items: T[],
  id: number,
): FlatItem[] {
  const tree = buildTree(items);
  const at = locate(tree, id);
  if (!at) return flatten(tree);
  const [node] = at.list.splice(at.index, 1);
  at.list.splice(at.index, 0, ...node.children);
  return flatten(tree);
}
