import { describe, expect, it } from "vitest";
import { parseStream } from "../../src/app/data";
import { parseCities } from "../../src/core/trips";

/** A response body that arrives in the given byte chunks, the way a slow network splits it. */
const body = (text: string, size: number) => {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<BufferSource>({
    start(c) {
      for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size));
      c.close();
    },
  });
};

describe("parseStream", () => {
  const tsv = ["Sofia\tSOF\tBG\t42.69\t23.32\t1236000", "Plovdiv\tPDV\tBG\t42.14\t24.75\t346893", "Zürich\tZRH\tCH\t47.37\t8.54\t421878"].join("\n") + "\n";

  it("parses every line, even ones split across chunks", async () => {
    for (const size of [1, 7, 40, 10_000]) {
      const got = await parseStream(body(tsv, size), parseCities);
      expect(got.map((c) => c.name)).toEqual(["Sofia", "Plovdiv", "Zürich"]);
    }
  });

  it("keeps a last line with no newline", async () => {
    const got = await parseStream(body(tsv.trimEnd(), 9), parseCities);
    expect(got.at(-1)).toMatchObject({ name: "Zürich", pop: 421878 });
  });
});
