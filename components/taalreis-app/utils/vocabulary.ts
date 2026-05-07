export function normalizePair(spanish: string, dutch: string) {
  return `${spanish.trim().toLowerCase()}::${dutch.trim().toLowerCase()}`;
}

type ParseVocabularyBulkInputOptions = {
  termDelimiter: string;
  cardDelimiter: string;
};

export function parseVocabularyBulkInput(
  raw: string,
  options: ParseVocabularyBulkInputOptions
) {
  const termDelimiter = options.termDelimiter;
  const cardDelimiter = options.cardDelimiter;

  if (!raw.trim() || !termDelimiter || !cardDelimiter) {
    return { rows: [] as string[][], invalidLines: [] as string[] };
  }

  const normalizedSource =
    cardDelimiter === "\n" ? raw.replace(/\r\n/g, "\n") : raw;
  const cards = normalizedSource
    .split(cardDelimiter)
    .map((card) => card.trim())
    .filter(Boolean);

  const rows: string[][] = [];
  const invalidLines: string[] = [];

  cards.forEach((card) => {
    const delimiterIndex = card.indexOf(termDelimiter);
    if (delimiterIndex < 0) {
      invalidLines.push(card);
      return;
    }

    const first = card.slice(0, delimiterIndex).trim();
    const second = card.slice(delimiterIndex + termDelimiter.length).trim();

    if (!first || !second) {
      invalidLines.push(card);
      return;
    }

    rows.push([first, second]);
  });

  return { rows, invalidLines };
}

export function sanitizeRows(rows: string[][]) {
  const seen = new Set<string>();
  const unique: string[][] = [];

  rows.forEach((row) => {
    const spanish = (row[0] ?? "").trim();
    const dutch = (row[1] ?? "").trim();

    if (!spanish || !dutch) {
      return;
    }

    const key = normalizePair(spanish, dutch);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push([spanish, dutch]);
  });

  return unique;
}
