export function splitSql(source: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollar = false;

  for (let index = 0; index < source.length; index += 1) {
    if (source.startsWith("$$", index)) {
      inDollar = !inDollar;
      current += "$$";
      index += 1;
      continue;
    }

    const character = source[index] ?? "";
    if (!inDollar && character === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      continue;
    }

    current += character;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}
