import type { PaletteCommand } from './setup-commands';

interface ScoredCommand {
  command: PaletteCommand;
  score: number;
}

export function fuzzySearch(query: string, commands: PaletteCommand[], maxResults = 10): PaletteCommand[] {
  const lowerQuery = query.toLowerCase();
  const scored: ScoredCommand[] = [];

  for (const cmd of commands) {
    const labelScore = scoreMatch(lowerQuery, cmd.label.toLowerCase());
    const keywordScore = Math.max(
      0,
      ...cmd.keywords.map((k) => scoreMatch(lowerQuery, k.toLowerCase()) * 0.8)
    );
    const score = Math.max(labelScore, keywordScore);

    if (score > 0) {
      scored.push({ command: cmd, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map((s) => s.command);
}

function scoreMatch(query: string, target: string): number {
  // Exact match
  if (target === query) return 100;

  // Starts with
  if (target.startsWith(query)) return 90;

  // Word start match (e.g., "pc" matches "Permission Sets" via "P...S...")
  const words = target.split(/\s+/);
  const initials = words.map((w) => w[0] ?? '').join('');
  if (initials.startsWith(query)) return 80;

  // Contains as substring
  if (target.includes(query)) return 70;

  // Fuzzy: all characters appear in order
  let qi = 0;
  let consecutiveBonus = 0;
  let lastMatchIndex = -2;

  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) {
      if (ti === lastMatchIndex + 1) consecutiveBonus += 5;
      lastMatchIndex = ti;
      qi++;
    }
  }

  if (qi === query.length) {
    return 40 + consecutiveBonus;
  }

  return 0;
}
