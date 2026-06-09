export type Snippet = {
  id: string;
  phrase: string;
  expansion: string;
};

export const SNIPPETS_KEY = "dictum.snippets.v1";

export function loadSnippets(): Snippet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SNIPPETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Snippet[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSnippets(snippets: Snippet[]) {
  try {
    window.localStorage.setItem(SNIPPETS_KEY, JSON.stringify(snippets));
  } catch {
    /* ignore */
  }
}

/** Mirror of the Rust snippet expander for the in-browser fallback. */
export function applySnippets(text: string, snippets: Snippet[]): string {
  if (!text || snippets.length === 0) return text;

  const ordered = [...snippets]
    .filter((s) => s.phrase.trim())
    .sort((a, b) => b.phrase.length - a.phrase.length);

  let result = text;
  for (const snippet of ordered) {
    result = replaceInsensitive(result, snippet.phrase, snippet.expansion);
  }
  return result;
}

function replaceInsensitive(haystack: string, needle: string, replacement: string) {
  if (!needle) return haystack;
  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let out = "";
  let i = 0;

  while (i < haystack.length) {
    const rel = lowerHay.indexOf(lowerNeedle, i);
    if (rel === -1) break;
    out += haystack.slice(i, rel) + replacement;
    i = rel + needle.length;
  }
  return out + haystack.slice(i);
}

export function newSnippet(
  phrase = "",
  expansion = ""
): Snippet {
  return {
    id: crypto.randomUUID(),
    phrase,
    expansion,
  };
}
