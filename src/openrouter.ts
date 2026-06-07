import { execFile } from 'child_process';

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Returns a function that prints the OpenRouter key by running a shell command. */
export function makeKeyGetter(command: string): () => Promise<string> {
  return () =>
    new Promise((resolve, reject) => {
      execFile('bash', ['-lc', command], (err, stdout) => {
        if (err) return reject(err);
        const key = stdout.trim();
        if (!key) return reject(new Error('empty OpenRouter key'));
        resolve(key);
      });
    });
}

async function translateChunk(
  key: string,
  model: string,
  lang: string,
  items: { id: string; text: string }[],
): Promise<Record<string, string>> {
  const system =
    `You are a translator. Translate each short technical description into the language with code "${lang}". ` +
    `Keep slash-commands, code identifiers, command names and product names untranslated. ` +
    `Return ONLY a JSON object mapping each id to its translated text.`;
  const user = JSON.stringify(items);

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}`);
  }
  const data: any = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(content) as Record<string, string>;
}

/** Translates all items in chunks of 40 and merges the results. */
export async function fetchTranslations(
  key: string,
  model: string,
  lang: string,
  items: { id: string; text: string }[],
): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};
  for (const group of chunk(items, 40)) {
    const part = await translateChunk(key, model, lang, group);
    Object.assign(merged, part);
  }
  return merged;
}
