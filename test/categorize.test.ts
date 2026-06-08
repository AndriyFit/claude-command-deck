import { describe, it, expect } from 'vitest';
import { categorize } from '../src/categorize';
import { CommandItem } from '../src/types';

function item(name: string, source = 'user'): CommandItem {
  return {
    id: `skill:${source}:${name}`,
    type: 'skill',
    name,
    source,
    invocation: source === 'user' ? `/${name}` : `/${source}:${name}`,
    rawDescription: '',
    contentHash: '',
  };
}

const cases: [string, string][] = [
  ['ads-meta', 'ads'],
  ['ads', 'ads'],
  ['google-ads-ecommerce', 'ads'],
  ['marketing-attribution-dashboard', 'ads'],
  ['dynamic-pricing-ecommerce', 'ecommerce'],
  ['google-shopping-feed', 'ecommerce'],
  ['webshop-ux-expertise', 'ecommerce'],
  ['code-review', 'review'],
  ['rust-review', 'review'],
  ['quality-gate', 'review'],
  ['test-coverage', 'testing'],
  ['go-test', 'testing'],
  ['e2e-testing', 'testing'],
  ['verification-before-completion', 'testing'],
  ['cpp-build', 'build'],
  ['build-fix', 'build'],
  ['systematic-debugging', 'build'],
  ['react-useeffect', 'frontend'],
  ['nextjs-app-router-v15', 'frontend'],
  ['frontend-design', 'frontend'],
  ['tailwind-v4', 'frontend'],
  ['backend-patterns', 'backend'],
  ['supabase-postgres', 'backend'],
  ['database-migrations', 'backend'],
  ['api-design', 'backend'],
  ['kotlin-ktor-patterns', 'backend'],
  ['python-patterns', 'lang'],
  ['android-clean-architecture', 'lang'],
  ['coding-standards', 'lang'],
  ['planning-with-files', 'planning'],
  ['brainstorming', 'planning'],
  ['discovery-interview', 'planning'],
  ['cf-deploy', 'deploy'],
  ['cloudflare-wrangler', 'deploy'],
  ['use-railway', 'deploy'],
  ['continuous-learning-v2', 'memory'],
  ['instinct-status', 'memory'],
  ['notebooklm', 'memory'],
  ['update-docs', 'docs'],
  ['skill-create', 'docs'],
  ['writing-skills', 'docs'],
  ['orchestrate', 'agents'],
  ['dispatching-parallel-agents', 'agents'],
  ['multi-execute', 'agents'],
  ['checkpoint', 'sessions'],
  ['save-session', 'sessions'],
  ['using-git-worktrees', 'sessions'],
];

describe('categorize', () => {
  for (const [name, expected] of cases) {
    it(`${name} -> ${expected}`, () => {
      expect(categorize(item(name))).toBe(expected);
    });
  }

  it('multi-frontend stays in frontend, not agents', () => {
    expect(categorize(item('multi-frontend'))).toBe('frontend');
  });

  it('multi-plan stays in planning, not agents', () => {
    expect(categorize(item('multi-plan'))).toBe('planning');
  });

  it('falls back to other for unknown names', () => {
    expect(categorize(item('xyzzy-unknown-thing'))).toBe('other');
  });
});
