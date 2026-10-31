// Postcards: send a card of where he is as a link, and read one a friend
// sent. The link carries the card itself (see core/postcard.ts), so sharing
// needs no server: the phone's share sheet when there is one, else the
// clipboard, else the link to copy by hand.
import { useState } from "preact/hooks";
import { encode, NAME_MAX, title, type Postcard } from "../core/postcard";
import { Card, KV } from "./kit";

/** The address of this game with `card` in its fragment. */
export const postcardUrl = (card: Postcard) => `${location.origin}${location.pathname}#${encode(card)}`;

/** One card's front: the title and what it says. */
export function PostcardView({ card }: { card: Postcard }) {
  return (
    <Card icon="📮" title={title(card)}>
      <KV k="🏙 City" v={card.city} />
      {card.place && <KV k="📍 At" v={card.place} />}
      <KV k="⭐ Level" v={card.level} />
      {card.line && <p class="postcard-line">“{card.line}”</p>}
    </Card>
  );
}

type Sent = { state: "" | "shared" | "copied" | "manual"; url?: string };

/** Hands `url` to the share sheet, else the clipboard; says which worked. "" when the player closed the share sheet. */
async function share(card: Postcard): Promise<Sent> {
  const url = postcardUrl(card);
  if (navigator.share) {
    try {
      await navigator.share({ title: title(card), url });
      return { state: "shared" };
    } catch (e) {
      if ((e as Error).name === "AbortError") return { state: "" };
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return { state: "copied" };
  } catch {
    return { state: "manual", url };
  }
}

/** Write and send a postcard of where he is now. */
export function PostcardSheet({ card, name, onName }: { card: Postcard; name: string; onName: (name: string) => void }) {
  const [sent, setSent] = useState<Sent>({ state: "" });
  return (
    <>
      <PostcardView card={card} />
      <Card icon="✍" title="Sign it">
        <input class="field" value={name} maxLength={NAME_MAX} placeholder="Your name (optional)" aria-label="Your name" onInput={(e) => onName((e.target as HTMLInputElement).value)} />
      </Card>
      <button class="btn primary" onClick={() => void share(card).then(setSent)}>
        📤 Share postcard
      </button>
      {sent.state === "shared" && <div class="notice ok">✔ Sent</div>}
      {sent.state === "copied" && <div class="notice ok">✔ Link copied. Paste it to a friend.</div>}
      {sent.state === "manual" && (
        <Card icon="🔗" title="Copy this link">
          <input class="field" readOnly value={sent.url} aria-label="Postcard link" onFocus={(e) => (e.target as HTMLInputElement).select()} />
        </Card>
      )}
    </>
  );
}

/** A postcard a friend sent: "Send one back" in a game (its sheet has ✕ Close), else "Start my own walk". */
export function ReceivedSheet({ card, onReply, onDone }: { card: Postcard; onReply?: () => void; onDone: () => void }) {
  return (
    <>
      <PostcardView card={card} />
      <button class="btn primary" onClick={onReply ?? onDone}>
        {onReply ? "📮 Send one back" : "Start my own walk"}
      </button>
    </>
  );
}
