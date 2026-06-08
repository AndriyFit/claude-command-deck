import { CommandItem } from './types';

export interface CategoryMeta {
  id: string;
  /** codicon name for the group node */
  icon: string;
  labels: { uk: string; en: string };
}

/**
 * Thematic categories in display order. The first rule whose regex matches the
 * item's bare name wins, so ORDER MATTERS — put the most specific buckets first.
 */
export const CATEGORIES: CategoryMeta[] = [
  { id: 'ads', icon: 'megaphone', labels: { uk: 'Реклама та маркетинг', en: 'Ads & Marketing' } },
  { id: 'ecommerce', icon: 'tag', labels: { uk: 'E-commerce та ціни', en: 'E-commerce & Pricing' } },
  { id: 'review', icon: 'search-fuzzy', labels: { uk: 'Перевірка коду', en: 'Code Review' } },
  { id: 'testing', icon: 'beaker', labels: { uk: 'Тестування', en: 'Testing' } },
  { id: 'build', icon: 'tools', labels: { uk: 'Білд та дебаг', en: 'Build & Debug' } },
  { id: 'frontend', icon: 'browser', labels: { uk: 'Фронтенд', en: 'Frontend' } },
  { id: 'backend', icon: 'server', labels: { uk: 'Бекенд та БД', en: 'Backend & DB' } },
  { id: 'lang', icon: 'code', labels: { uk: 'Мови та патерни', en: 'Languages & Patterns' } },
  { id: 'planning', icon: 'checklist', labels: { uk: 'Планування', en: 'Planning' } },
  { id: 'deploy', icon: 'rocket', labels: { uk: 'Деплой та інфра', en: 'Deploy & Infra' } },
  { id: 'memory', icon: 'lightbulb', labels: { uk: "Пам'ять та навчання", en: 'Memory & Learning' } },
  { id: 'docs', icon: 'book', labels: { uk: 'Документація', en: 'Docs' } },
  { id: 'agents', icon: 'organization', labels: { uk: 'Оркестрація агентів', en: 'Agent Orchestration' } },
  { id: 'sessions', icon: 'history', labels: { uk: 'Сесії та утиліти', en: 'Sessions & Utilities' } },
  { id: 'other', icon: 'circle-large-outline', labels: { uk: 'Інше', en: 'Other' } },
];

const RULES: [string, RegExp][] = [
  ['ads', /(^ads$|^ads-|campaign|marketing|attribution|conversion-rate|cart-abandon|first-party|product-launch|seasonal|meta-ads|google-ads)/],
  ['ecommerce', /(pricing|dropship|ecommerce|shopping|social-commerce|video-commerce|webshop|competitor-price|storefront|feed-management|growth-strategy|keyword-research|^ecommerce-seo|-seo$)/],
  ['review', /(review|quality-gate|plankton|code-quality|^security)/],
  ['testing', /(test|tdd|^e2e|(^|-)eval|verif|regression)/],
  ['build', /(build|debug)/],
  ['frontend', /(frontend|react|next|nuqs|shadcn|tailwind|turbopack|routing-middleware|chat-sdk|ai-sdk|ai-gateway|runtime-cache|cache-components|slides|ux-expert)/],
  ['backend', /(backend|^api|database|postgres|supabase|clickhouse|jpa|migration|mcp-server|ktor|exposed|^auth$|storage|functions)/],
  ['lang', /(patterns|coding-standard|clean-architecture|coroutines|multiplatform)/],
  ['planning', /(plan|brainstorm|discovery|interview|strategic-compact)/],
  ['deploy', /(deploy|cloudflare|wrangler|railway|^env|bootstrap|vercel-cli|firewall|sandbox|pm2|setup|configure|^status$|marketplace)/],
  ['memory', /(learn|continuous|dream|evolve|promote|prune|instinct|iterative-retr|rules-distill|notebooklm|recall|retain)/],
  ['docs', /(docs|codemaps|recipes|examples|starters|skill-|knowledge-update|writing-skills)/],
  ['agents', /(orchestrate|multi-|devfleet|dispatch|subagent|dmux|loop|ralph|^claw|aside|harness|model-route|prompt-optimize|^agent|workflow)/],
  ['sessions', /(checkpoint|context-budget|session|^projects$|night-shift|refactor|worktree|finishing|using-superpowers|convention|guidelines|^help$)/],
];

export function categorize(item: CommandItem): string {
  const name = item.name.toLowerCase();
  for (const [id, rx] of RULES) {
    if (rx.test(name)) return id;
  }
  return 'other';
}

export function categoryLabel(id: string, lang: string): string {
  const meta = CATEGORIES.find(c => c.id === id);
  if (!meta) return id;
  return lang.startsWith('uk') ? meta.labels.uk : meta.labels.en;
}

export function categoryIcon(id: string): string {
  return CATEGORIES.find(c => c.id === id)?.icon ?? 'circle-large-outline';
}
