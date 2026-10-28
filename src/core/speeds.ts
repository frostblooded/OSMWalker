// Realistic speeds in meters per second.

/** Door-to-door city averages, counting lights and traffic. */
export const WALK = 5 / 3.6;
export const BIKE = 15 / 3.6;
export const MOTORCYCLE = 30 / 3.6;
export const CAR = 35 / 3.6;
export type Vehicle = "" | "bike" | "motorcycle" | "car";
/** Base speed for each vehicle kind an item can be (see items.ts). */
export const FOR_VEHICLE: Record<Exclude<Vehicle, "">, number> = { bike: BIKE, motorcycle: MOTORCYCLE, car: CAR };

/** Between cities. */
export const BUS = 80 / 3.6;
export const PLANE = 800 / 3.6;
export const CAR_ROAD = 90 / 3.6;
