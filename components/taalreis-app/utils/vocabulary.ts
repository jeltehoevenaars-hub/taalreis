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
