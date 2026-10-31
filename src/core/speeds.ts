// Realistic speeds in meters per second.

/** Door-to-door city averages, counting lights and traffic. */
export const WALK = 5 / 3.6;
export const BIKE = 15 / 3.6;
export const MOTORCYCLE = 30 / 3.6;
export const CAR = 35 / 3.6;
/** Fantasy mounts: a giant tortoise plods, the flyers go in a straight line over the city (see walker.ts). */
export const TORTOISE = 7 / 3.6;
export const BROOM = 25 / 3.6;
export const CARPET = 40 / 3.6;
export const DRAGON = 80 / 3.6;
export type Vehicle = "" | "bike" | "motorcycle" | "car" | "tortoise" | "broom" | "carpet" | "dragon";
/** Base speed for each vehicle kind an item can be (see items.ts). */
export const FOR_VEHICLE: Record<Exclude<Vehicle, "">, number> = {
  bike: BIKE, motorcycle: MOTORCYCLE, car: CAR, tortoise: TORTOISE, broom: BROOM, carpet: CARPET, dragon: DRAGON,
};
/** Mounts that fly over the streets instead of following them. */
export const FLYERS: ReadonlySet<Vehicle> = new Set(["broom", "carpet", "dragon"]);

/** Across town to a trip's station: the metro, counting the walk to and from it and the wait. */
export const METRO = 30 / 3.6;

/** Between cities. */
export const BUS = 80 / 3.6;
export const PLANE = 800 / 3.6;
export const CAR_ROAD = 90 / 3.6;
export const TRAIN = 100 / 3.6;
export const FERRY = 30 / 3.6;
/** On his bike on country roads, and hitching (counting the wait by the road). */
export const BIKE_ROAD = 18 / 3.6;
export const HITCH = 50 / 3.6;
