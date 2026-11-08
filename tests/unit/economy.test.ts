// The economy targets (docs/design-research.md, rule 10), for a player who
// goes for what the next upgrade needs: the first upgrade within 20 minutes of
// play, then one every 10 to 60 minutes (most 20 to 40), a pick every 2 to 6
// minutes. `npm run sim` prints the whole table.
import { describe, expect, it } from "vitest";
import { LADDER } from "../../src/core/upgrades";
import { summary } from "../support/economy";

// Fewer runs in the checks, so they stay fast; `npm run sim` plays more.
const SIM = !!process.env.SIM;
const greedy = SIM ? summary("greedy") : summary("greedy", 5, 5);

if (SIM) {
  const random = summary("random");
  const row = (s: typeof greedy, id: string) => (Number.isFinite(s.at[id as keyof typeof s.at]) ? `${s.at[id as keyof typeof s.at].toFixed(0)} min` : "never");
  console.log(["| Upgrade | Level | Price | Greedy player | Random player |", "| --- | --- | --- | --- | --- |", ...LADDER.map((u) => `| ${u.icon} ${u.name} | ${u.level} | €${u.cents / 100} | ${row(greedy, u.id)} | ${row(random, u.id)} |`)].join("\n"));
  console.log(`Minutes per pick: greedy ${greedy.walkMin.toFixed(1)}, random ${random.walkMin.toFixed(1)}`);
  console.log(`Level reached (greedy, min): ${[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((l) => `L${l} ${greedy.level(l).toFixed(0)}`).join(", ")}`);
}

describe("the economy", () => {
  it("gives the first upgrade within 20 minutes", () => {
    expect(greedy.at.map).toBeGreaterThan(5);
    expect(greedy.at.map).toBeLessThan(20);
  });

  it("gives every upgrade, each 10 to 60 minutes after the one before", () => {
    const at = LADDER.map((u) => greedy.at[u.id]);
    for (let i = 1; i < at.length; i++) {
      expect(at[i]! - at[i - 1]!, LADDER[i]!.name).toBeGreaterThan(10);
      expect(at[i]! - at[i - 1]!, LADDER[i]!.name).toBeLessThan(60);
    }
  });

  it("deals a pick every 2 to 6 minutes", () => {
    expect(greedy.walkMin).toBeGreaterThan(2);
    expect(greedy.walkMin).toBeLessThan(6);
  });
});
