import { CommandItem } from './types';
import { CATEGORIES, categorize, categoryLabel, categoryIcon } from './categorize';

export interface TreeGroup {
  id: string;
  label: string;
  icon: string;
  items: CommandItem[];
}

/**
 * Groups items into thematic categories (Ads, Frontend, Backend, ...).
 * Commands and skills are mixed within a category; each item keeps its own
 * type icon. Empty categories are omitted. Within a category, commands come
 * first, then alphabetical by name.
 */
export function buildGroups(items: CommandItem[], lang = 'uk'): TreeGroup[] {
  const buckets = new Map<string, CommandItem[]>();
  for (const item of items) {
    const cat = categorize(item);
    const bucket = buckets.get(cat) ?? [];
    bucket.push(item);
    buckets.set(cat, bucket);
  }

  const order = (a: CommandItem, b: CommandItem) => {
    if (a.type !== b.type) return a.type === 'command' ? -1 : 1;
    return a.name.localeCompare(b.name);
  };

  const groups: TreeGroup[] = [];
  for (const cat of CATEGORIES) {
    const bucket = buckets.get(cat.id);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort(order);
    groups.push({
      id: cat.id,
      label: `${categoryLabel(cat.id, lang)} (${bucket.length})`,
      icon: categoryIcon(cat.id),
      items: bucket,
    });
  }
  return groups;
}
