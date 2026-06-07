export type ItemType = 'command' | 'skill';

export interface CommandItem {
  /** Stable id: `${type}:${source}:${name}` */
  id: string;
  type: ItemType;
  /** Bare name, e.g. "code-review" */
  name: string;
  /** Text inserted into the terminal, e.g. "/code-review" or "/superpowers:brainstorming" */
  invocation: string;
  /** "user" or the plugin name */
  source: string;
  /** Description extracted from the file (original language) */
  rawDescription: string;
  /** Hash of rawDescription, used to invalidate the translation cache */
  contentHash: string;
}
