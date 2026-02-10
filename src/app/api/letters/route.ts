import { NextResponse } from "next/server";

type GvizCell = {
  v?: string | number | boolean | null;
  f?: string;
} | null;

type GvizResponse = {
  table?: {
    cols?: Array<{ label?: string }>;
    rows?: Array<{ c?: GvizCell[] }>;
  };
};

type Letter = {
  id: string;
  number: string;
  tag: string;
  text: string;
  audio: string;
};

const DEFAULT_SHEET_ID = "1xDCcCLbZPnHtqhYl5yzBCw1VY_yBcq250uQXtSd0THo";
const DEFAULT_SHEET_GID = "0";

const normalizeLabel = (label: string) =>
  label.toLowerCase().trim().replace(/\s+/g, "").replace(/[^a-z0-9#]/g, "");

const pickColumn = (labels: string[], aliases: string[]) => {
  const normalizedLabels = labels.map(normalizeLabel);
  const normalizedAliases = aliases.map(normalizeLabel);

  for (const alias of normalizedAliases) {
    const exactIndex = normalizedLabels.indexOf(alias);
    if (exactIndex !== -1) {
      return exactIndex;
    }
  }

  for (const alias of normalizedAliases) {
    const containsIndex = normalizedLabels.findIndex((column) =>
      column.includes(alias),
    );
    if (containsIndex !== -1) {
      return containsIndex;
    }
  }

  return -1;
};

const cellText = (cell: GvizCell): string => {
  if (!cell) {
    return "";
  }

  if (typeof cell.f === "string" && cell.f.trim()) {
    return cell.f.trim();
  }

  if (typeof cell.v === "string") {
    return cell.v.trim();
  }

  if (typeof cell.v === "number" || typeof cell.v === "boolean") {
    return String(cell.v);
  }

  return "";
};

const hashText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
};

const parseGvizPayload = (payload: string): GvizResponse | null => {
  const match = payload.match(
    /google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/,
  );

  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as GvizResponse;
  } catch {
    return null;
  }
};

export async function GET() {
  const sheetId = process.env.SHEET_ID || DEFAULT_SHEET_ID;
  const sheetGid = process.env.SHEET_GID || DEFAULT_SHEET_GID;

  const url =
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq` +
    `?gid=${sheetGid}&headers=1&tqx=out:json`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            "Could not reach the Google Sheet. Confirm the sheet is shared publicly.",
        },
        { status: 502 },
      );
    }

    const body = await response.text();
    const gvizData = parseGvizPayload(body);

    if (!gvizData?.table?.cols || !gvizData.table.rows) {
      return NextResponse.json(
        {
          error:
            "Could not parse the Google Sheet. Confirm the columns are '#', 'Tag', 'Text', and 'Audio'.",
        },
        { status: 500 },
      );
    }

    const columnLabels = gvizData.table.cols.map((column) => column.label ?? "");

    const numberColumn = pickColumn(columnLabels, ["#", "number", "num", "id"]);
    const tagColumn = pickColumn(columnLabels, ["tag", "type", "category"]);
    const textColumn = pickColumn(columnLabels, ["text", "message", "letter", "note", "poem"]);
    const audioColumn = pickColumn(columnLabels, ["audio", "audio link", "audiolink", "voice", "url"]);

    if (textColumn === -1) {
      return NextResponse.json(
        {
          error:
            "No usable 'Text' column found. Add a column named 'Text'.",
        },
        { status: 500 },
      );
    }

    const letters: Letter[] = gvizData.table.rows
      .map((row, index) => {
        const cells = row.c ?? [];
        const text = cellText(cells[textColumn]);

        if (!text) {
          return null;
        }

        const numberRaw = numberColumn !== -1 ? cellText(cells[numberColumn]) : "";
        const number = numberRaw
          ? numberRaw.startsWith("#")
            ? numberRaw
            : `#${numberRaw}`
          : `#${index + 1}`;

        const tag = tagColumn !== -1 ? cellText(cells[tagColumn]) || "Note" : "Note";
        const audio = audioColumn !== -1 ? cellText(cells[audioColumn]) : "";

        return {
          id: `${number}-${hashText(text).slice(0, 8)}-${index}`,
          number,
          tag,
          text,
          audio,
        };
      })
      .filter((item): item is Letter => item !== null);

    return NextResponse.json({ letters });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not load entries from Google Sheets. Confirm the sheet is public and reachable.",
      },
      { status: 500 },
    );
  }
}
