import { wrapText } from './text.js';
import type { AreaBox, Box, LayoutArea, Typography } from './types.js';

/** Geometric padding and measured header shared by placement and scene assembly. */
export function areaGeometry(title: string, members: Box[], typography: Typography): AreaBox {
  const x = Math.min(...members.map(box => box.x)) - 32;
  const right = Math.max(...members.map(box => box.x + box.width)) + 32;
  const width = right - x, text = wrapText(title, width - 48, typography.fontSize);
  const headerHeight = text.split('\n').length * typography.fontSize * typography.lineHeight + 28;
  const y = Math.min(...members.map(box => box.y)) - headerHeight - 24;
  return { x, y, width, height: Math.max(...members.map(box => box.y + box.height)) + 32 - y, text, headerHeight };
}

export function areaGeometries(areas: LayoutArea[], nodeBoxes: Map<string, Box>): Map<string, AreaBox> {
  const result = new Map<string, AreaBox>();
  const measure = (area: LayoutArea): AreaBox => {
    if (result.has(area.id)) return result.get(area.id)!;
    const members = [...area.nodeIds.map(id => nodeBoxes.get(id)!), ...areas.filter(child => child.parentId === area.id).map(measure)];
    const box = areaGeometry(area.title, members, area.typography);
    result.set(area.id, box);
    return box;
  };
  areas.forEach(measure);
  return result;
}
