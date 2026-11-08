// The upgrades, bought with the Shop button at any time: each one can be
// bought again and again, costs GROWTH times the one before, and stacks by
// multiplying. Speed is open from the start; buying OPENS_AFTER of one opens
// the next. Pure data and logic, so it is easy to test.

export type UpgradeId = "speed" | "orders";

export type Upgrade = {
  id: UpgradeId;
  icon: string;
  name: string;
  /** The first one's price in cents; each later one costs GROWTH times more. */
  cents: number;
  /** What one more does, for the Shop and Help. */
  does: string;
  /** The upgrade he needs OPENS_AFTER of first, if any. */
  after?: UpgradeId;
};

/** Each upgrade multiplies by this: +10% speed, or a 10% shorter wait for orders. */
export const SPEED_STEP = 1.1;
export const WAIT_STEP = 0.9;
/** Each repeat buy costs this many times the last one. */
export const GROWTH = 1.15;
/** Buying this many of one upgrade opens the next. */
export const OPENS_AFTER = 10;

export const UPGRADES: readonly Upgrade[] = [
  { id: "speed", icon: "🔧", name: "Bike tune-up", cents: 450, does: "he rides 10% faster" },
  { id: "orders", icon: "📱", name: "Delivery app boost", cents: 1500, does: "orders come 10% sooner", after: "speed" },
];

export const upgradeOf = (id: string): Upgrade | undefined => UPGRADES.find((u) => u.id === id);

/** How many of each upgrade he owns. */
export type Owned = Partial<Record<UpgradeId, number>>;
export const count = (owned: Owned, id: UpgradeId) => owned[id] ?? 0;

/** What the next `u` costs, in cents, rounded to 10 cents. */
export const priceOf = (u: Upgrade, owned: Owned) => Math.round((u.cents * GROWTH ** count(owned, u.id)) / 10) * 10;

/** True once the upgrade it waits for has been bought OPENS_AFTER times. */
export const isOpen = (u: Upgrade, owned: Owned) => !u.after || count(owned, u.after) >= OPENS_AFTER;

/** His speed and order wait, times the start. */
export const speedX = (owned: Owned) => SPEED_STEP ** count(owned, "speed");
export const waitX = (owned: Owned) => WAIT_STEP ** count(owned, "orders");
