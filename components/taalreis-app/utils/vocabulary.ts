export function normalizePair(spanish: string, dutch: string) {
  return `${spanish.trim().toLowerCase()}::${dutch.trim().toLowerCase()}`;
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


export type VocabularyBulkParseOptions = {
  termDelimiter: string | RegExp;
  cardDelimiter: string | RegExp;
};

export function parseVocabularyBulkInput(raw: string, options: VocabularyBulkParseOptions) {
  const { termDelimiter, cardDelimiter } = options;

  const splitByCardDelimiter =
    typeof cardDelimiter === "string"
      ? raw.split(cardDelimiter)
      : raw.split(cardDelimiter);

  const rows: string[][] = [];
  const invalidLines: string[] = [];

  splitByCardDelimiter.forEach((card) => {
    const trimmedCard = card.trim();
    if (!trimmedCard) {
      return;
    }

    const delimiterIndex =
      typeof termDelimiter === "string"
        ? trimmedCard.indexOf(termDelimiter)
        : trimmedCard.search(termDelimiter);

    if (delimiterIndex < 0) {
      invalidLines.push(trimmedCard);
      return;
    }

    const delimiterLength =
      typeof termDelimiter === "string"
        ? termDelimiter.length
        : (trimmedCard.match(termDelimiter)?.[0]?.length ?? 0);

    if (delimiterLength === 0) {
      invalidLines.push(trimmedCard);
      return;
    }

    const left = trimmedCard.slice(0, delimiterIndex).trim();
    const right = trimmedCard.slice(delimiterIndex + delimiterLength).trim();

    if (!left || !right) {
      invalidLines.push(trimmedCard);
      return;
    }

    rows.push([left, right]);
  });

  return { rows, invalidLines };
}
