let seq = 1;

export function stamp(node) {
  if (!node.id) node.id = "n" + (seq += 1);
  (node.children || []).forEach(stamp);
  return node;
}

export function findNode(node, id, parent = null) {
  if (!node) return null;
  if (node.id === id) return { node, parent };
  for (const child of node.children || []) {
    const hit = findNode(child, id, node);
    if (hit) return hit;
  }
  return null;
}

export function addChild(design, parentId, partId, radial) {
  const hit = findNode(design.root, parentId);
  if (!hit) return;
  hit.node.children = hit.node.children || [];
  hit.node.children.push(stamp({ part: partId, radial: radial || 0, children: [] }));
}

export function removeNode(design, id) {
  if (design.root.id === id) return false;
  const hit = findNode(design.root, id);
  if (!hit || !hit.parent) return false;
  hit.parent.children = hit.parent.children.filter((child) => child.id !== id);
  return true;
}

export function walk(node, visit, depth = 0) {
  visit(node, depth);
  (node.children || []).forEach((child) => walk(child, visit, depth + 1));
}
