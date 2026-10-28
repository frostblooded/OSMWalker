import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A bundled data file from public/data, as text. */
export function dataFile(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../public/data/${name}`, import.meta.url)), "utf8");
}
