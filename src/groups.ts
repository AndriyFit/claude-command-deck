import { CommandItem, ItemType } from './types';

export interface TreeGroup {
  id: ItemType;
  label: string;
  items: CommandItem[];
}

export function buildGroups(items: CommandItem[]): TreeGroup[] {
  const byName = (a: CommandItem, b: CommandItem) => a.name.localeCompare(b.name);
  const commands = items.filter(i => i.type === 'command').sort(byName);
  const skills = items.filter(i => i.type === 'skill').sort(byName);
  return [
    { id: 'command', label: `Commands (${commands.length})`, items: commands },
    { id: 'skill', label: `Skills (${skills.length})`, items: skills },
  ];
}
