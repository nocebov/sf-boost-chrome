import type { PaletteCommand } from './setup-commands';

interface ScoredCommand {
  command: PaletteCommand;
  score: number;
}

interface PreparedField {
  text: string;
  compact: string;
  tokens: string[];
  initials: string;
  weight: number;
}

interface PreparedCommand {
  fields: PreparedField[];
}

const KEYWORD_FIELD_WEIGHT = 0.82;
const CATEGORY_FIELD_WEIGHT = 0.55;
const MIN_SCORE = 18;

const FILLER_TOKENS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'go',
  'in',
  'into',
  'of',
  'on',
  'open',
  'page',
  'pages',
  'please',
  'sf',
  'setup',
  'the',
  'to',
  'with',
]);

const preparedCommandCache = new WeakMap<PaletteCommand, PreparedCommand>();

export function fuzzySearch(query: string, commands: PaletteCommand[], maxResults = 10): PaletteCommand[] {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery || commands.length === 0 || maxResults <= 0) {
    return [];
  }

  const queryCompact = compactText(normalizedQuery);
  const queryTokens = tokenize(normalizedQuery);
  const scored: ScoredCommand[] = [];

  for (const command of commands) {
    const prepared = prepareCommand(command);
    const phraseScore = Math.max(...prepared.fields.map((field) => scorePhraseMatch(normalizedQuery, queryCompact, field)));
    const tokenScore = scoreTokenCoverage(queryTokens, queryCompact, prepared.fields);
    const score = phraseScore + tokenScore;

    if (score >= MIN_SCORE) {
      scored.push({ command, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label));
  return scored.slice(0, maxResults).map((entry) => entry.command);
}

function prepareCommand(command: PaletteCommand): PreparedCommand {
  const cached = preparedCommandCache.get(command);
  if (cached) {
    return cached;
  }

  const fields = [
    createField(command.label, 1),
    ...command.keywords.map((keyword) => createField(keyword, KEYWORD_FIELD_WEIGHT)),
    createField(command.category, CATEGORY_FIELD_WEIGHT),
  ].filter((field): field is PreparedField => field !== null);

  const prepared = { fields };
  preparedCommandCache.set(command, prepared);
  return prepared;
}

function createField(value: string, weight: number): PreparedField | null {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const tokens = tokenize(text);

  return {
    text,
    compact: compactText(text),
    tokens,
    initials: tokens.map((token) => token[0] ?? '').join(''),
    weight,
  };
}

function scorePhraseMatch(query: string, queryCompact: string, field: PreparedField): number {
  let rawScore = 0;

  if (field.text === query) {
    rawScore = 120;
  } else if (queryCompact.length >= 2 && field.compact === queryCompact) {
    rawScore = 112;
  } else if (field.text.startsWith(query)) {
    rawScore = 102;
  } else if (!query.includes(' ') && field.tokens.some((token) => token.startsWith(query))) {
    rawScore = 94;
  } else if (queryCompact.length >= 2 && field.initials === queryCompact) {
    rawScore = 92;
  } else if (queryCompact.length >= 2 && field.initials.startsWith(queryCompact)) {
    rawScore = 88;
  } else if (field.text.includes(query)) {
    rawScore = 84;
  } else if (queryCompact.length >= 3 && field.compact.includes(queryCompact)) {
    rawScore = 80;
  } else if (query.length >= 3) {
    const maxDistance = getMaxDistance(Math.max(query.length, field.text.length));
    const distance = levenshteinBounded(query, field.text, maxDistance);
    if (distance !== null) {
      rawScore = 76 - distance * 6;
    }
  }

  if (rawScore === 0 && queryCompact.length >= 2) {
    const subsequenceBonus = getSubsequenceBonus(queryCompact, field.compact);
    if (subsequenceBonus !== null) {
      rawScore = 56 + subsequenceBonus * 40;
    }
  }

  return rawScore * field.weight;
}

function scoreTokenCoverage(queryTokens: string[], queryCompact: string, fields: PreparedField[]): number {
  if (queryTokens.length === 0) {
    return 0;
  }

  const specificity = getQuerySpecificity(queryCompact.length, queryTokens.length);
  let totalWeight = 0;
  let matchedWeight = 0;
  let matchedScore = 0;
  let strongMatches = 0;

  for (const queryToken of queryTokens) {
    const tokenWeight = getQueryTokenWeight(queryToken);
    totalWeight += tokenWeight;

    const bestScore = getBestTokenScore(queryToken, fields);
    matchedScore += bestScore * tokenWeight;

    if (bestScore >= 0.55) {
      matchedWeight += tokenWeight;
    }

    if (bestScore >= 0.9) {
      strongMatches += 1;
    }
  }

  if (totalWeight === 0) {
    return 0;
  }

  const coverage = matchedWeight / totalWeight;
  const averageMatch = matchedScore / totalWeight;

  if (coverage < 0.34 && averageMatch < 0.38) {
    return 0;
  }

  const completeBonus = strongMatches === queryTokens.length && queryTokens.length > 1 ? 10 : 0;
  return (coverage * 62 + averageMatch * 36 + completeBonus) * specificity;
}

function getBestTokenScore(queryToken: string, fields: PreparedField[]): number {
  let bestScore = 0;

  for (const field of fields) {
    if (field.initials) {
      bestScore = Math.max(bestScore, scoreInitialTokenMatch(queryToken, field.initials) * field.weight);
    }

    for (const candidateToken of field.tokens) {
      bestScore = Math.max(bestScore, scoreTokenMatch(queryToken, candidateToken) * field.weight);
    }
  }

  return bestScore;
}

function scoreInitialTokenMatch(queryToken: string, initials: string): number {
  if (queryToken.length < 2 || !initials) {
    return 0;
  }

  if (initials === queryToken) {
    return 0.98;
  }

  if (initials.startsWith(queryToken)) {
    return 0.9;
  }

  if (initials.length >= 2 && queryToken.startsWith(initials)) {
    return 0.86;
  }

  return 0;
}

function scoreTokenMatch(queryToken: string, candidateToken: string): number {
  if (candidateToken === queryToken) {
    return 1;
  }

  if (candidateToken.startsWith(queryToken)) {
    return queryToken.length >= 3 ? 0.95 : 0.9;
  }

  if (candidateToken.length >= 3 && queryToken.startsWith(candidateToken)) {
    return 0.91;
  }

  if (queryToken.length >= 3 && candidateToken.includes(queryToken)) {
    return 0.84;
  }

  if (queryToken.length >= 3 && candidateToken.length >= 3) {
    const maxDistance = getMaxDistance(Math.max(queryToken.length, candidateToken.length));
    const distance = levenshteinBounded(queryToken, candidateToken, maxDistance);
    if (distance !== null) {
      const similarity = 1 - distance / Math.max(queryToken.length, candidateToken.length);
      return 0.7 + similarity * 0.18;
    }
  }

  if (queryToken.length >= 2) {
    const subsequenceBonus = getSubsequenceBonus(queryToken, candidateToken);
    if (subsequenceBonus !== null) {
      return 0.56 + subsequenceBonus;
    }
  }

  return 0;
}

function getSubsequenceBonus(query: string, target: string): number | null {
  let queryIndex = 0;
  let currentRun = 0;
  let longestRun = 0;
  let lastMatchIndex = -2;

  for (let targetIndex = 0; targetIndex < target.length && queryIndex < query.length; targetIndex++) {
    if (target[targetIndex] !== query[queryIndex]) {
      continue;
    }

    currentRun = targetIndex === lastMatchIndex + 1 ? currentRun + 1 : 1;
    longestRun = Math.max(longestRun, currentRun);
    lastMatchIndex = targetIndex;
    queryIndex += 1;
  }

  if (queryIndex !== query.length) {
    return null;
  }

  return Math.min(0.16, (longestRun / query.length) * 0.16);
}

function getQuerySpecificity(compactLength: number, tokenCount: number): number {
  const compactFactor = Math.min(1, compactLength / 4);
  const tokenFactor = Math.min(1, Math.max(0.45, tokenCount / 2));
  return Math.max(compactFactor, tokenFactor);
}

function getQueryTokenWeight(token: string): number {
  if (token.length <= 1) {
    return 0.2;
  }

  if (FILLER_TOKENS.has(token)) {
    return token.length <= 3 ? 0.25 : 0.4;
  }

  if (token.length === 2) {
    return 0.55;
  }

  return 1;
}

function getMaxDistance(length: number): number {
  if (length <= 4) {
    return 1;
  }

  if (length <= 8) {
    return 2;
  }

  return 3;
}

function levenshteinBounded(left: string, right: string, maxDistance: number): number | null {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return null;
  }

  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const currentRow: number[] = [leftIndex];
    let rowMin = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        currentRow[rightIndex - 1]! + 1,
        previousRow[rightIndex]! + 1,
        previousRow[rightIndex - 1]! + substitutionCost,
      );

      currentRow[rightIndex] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) {
      return null;
    }

    previousRow = currentRow;
  }

  const distance = previousRow[right.length]!;
  return distance <= maxDistance ? distance : null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactText(value: string): string {
  return value.replace(/\s+/g, '');
}

function tokenize(value: string): string[] {
  if (!value) {
    return [];
  }

  return value.split(' ').filter(Boolean);
}
