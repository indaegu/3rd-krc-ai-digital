// quote-aware 최소 CSV 파서(RFC 4180 계열).
// 외부 CSV 라이브러리를 추가하지 않기 위한 내장 구현이다.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index] as string;

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      index += 1;
      continue;
    }
    if (char === "\r" && text[index + 1] === "\n") {
      pushRow();
      index += 2;
      continue;
    }
    if (char === "\n") {
      pushRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  // 마지막 줄바꿈 없이 끝나는 잔여 필드 처리(빈 꼬리 행은 만들지 않는다).
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

/** 빈 문자열·`-`·비숫자는 null. 음수는 숫자로 유지한다(격리 판단은 호출자 몫). */
export function parseNumericCell(cell: string): number | null {
  const trimmed = cell.trim();
  if (trimmed === "" || trimmed === "-") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
