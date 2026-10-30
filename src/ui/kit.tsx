// The pieces every screen is built from (docs/ui-guidelines.md): cards with
// an icon and heading, key/value rows, bars, zebra lists and sections that
// open when their heading is tapped.
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { Rarity } from "../core/items";

export const RARITY_COLOR: Record<Rarity, string> = { Common: "#6b7280", Uncommon: "#2e9e44", Rare: "#1a5fb4", Legendary: "#e8730c" };

export function Card({ icon, title, right, tone, children }: { icon: string; title: string; right?: ComponentChildren; tone?: "error" | "warning" | "ok"; children?: ComponentChildren }) {
  return (
    <section class={`card${tone ? ` tone-${tone}` : ""}`}>
      <h2>
        <span aria-hidden="true">{icon}</span>
        <span class="grow">{title}</span>
        {right !== undefined && <span class="right">{right}</span>}
      </h2>
      {children}
    </section>
  );
}

export function KV({ k, v, tone }: { k: ComponentChildren; v: ComponentChildren; tone?: "error" | "warning" | "ok" }) {
  return (
    <div class={`kv${tone ? ` tone-${tone}` : ""}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

/** A coloured bar for a share in [0, 1]. */
export function Bar({ share, color }: { share: number; color?: string }) {
  return (
    <div class="bar" aria-hidden="true">
      <div style={{ width: `${Math.round(Math.min(Math.max(share, 0), 1) * 100)}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

/** A heading row that opens and closes what is under it; the caret sits at the end of the text. */
export function Collapsible({ title, open: start = false, right, children }: { title: ComponentChildren; open?: boolean; right?: ComponentChildren; children: ComponentChildren }) {
  const [open, setOpen] = useState(start);
  return (
    <div class="fold">
      <button class="fold-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span class="grow">
          {title} {open ? "▾" : "▸"}
        </span>
        {right !== undefined && <span class="dim">{right}</span>}
      </button>
      {open && <div class="fold-body">{children}</div>}
    </div>
  );
}

/** A log entry: one short title that opens into its detail lines. */
export function Entry({ title, lines, tone }: { title: string; lines: string[]; tone?: "error" | "warning" }) {
  const [open, setOpen] = useState(false);
  return (
    <div class={tone ? `tone-${tone}` : ""}>
      <button class="row" aria-expanded={open} onClick={() => setOpen(!open)} disabled={!lines.length}>
        {title} {lines.length ? (open ? "▾" : "▸") : ""}
      </button>
      {open && (
        <div class="lines dim small">
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
