import { CommandItem } from './types';

export interface TreeGroup {
  id: string;
  label: string;
  items: CommandItem[];
}

const SOURCE_LABELS: Record<string, string> = {
  user: 'User',
  superpowers: 'Superpowers',
  'code-review': 'Code Review',
  'frontend-design': 'Frontend Design',
  'vercel': 'Vercel',
  'railway': 'Railway',
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

export function buildGroups(items: CommandItem[]): TreeGroup[] {
  const byName = (a: CommandItem, b: CommandItem) => a.name.localeCompare(b.name);

  const commands = items.filter(i => i.type === 'command').sort(byName);
  const skills = items.filter(i => i.type === 'skill');

  // group skills by source
  const sourceMap = new Map<string, CommandItem[]>();
  for (const s of skills) {
    const bucket = sourceMap.get(s.source) ?? [];
    bucket.push(s);
    sourceMap.set(s.source, bucket);
  }

  const groups: TreeGroup[] = [];

  if (commands.length > 0) {
    groups.push({ id: 'commands', label: `Commands (${commands.length})`, items: commands });
  }

  // user skills first, then plugins alphabetically
  const sources = [...sourceMap.keys()].sort((a, b) => {
    if (a === 'user') return -1;
    if (b === 'user') return 1;
    return a.localeCompare(b);
  });

  for (const source of sources) {
    const bucket = sourceMap.get(source)!.sort(byName);
    const label = `${sourceLabel(source)} Skills (${bucket.length})`;
    groups.push({ id: `skill:${source}`, label, items: bucket });
  }

  return groups;
}
