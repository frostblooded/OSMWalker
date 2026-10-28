## Realistic speeds in meters per second: door-to-door city averages,
## counting lights and traffic.
extends RefCounted

const WALK := 5.0 / 3.6
const BIKE := 15.0 / 3.6
const MOTORCYCLE := 30.0 / 3.6
const CAR := 35.0 / 3.6
## Base speed for each vehicle kind an item can be (see items.gd).
const FOR_VEHICLE := {"bike": BIKE, "motorcycle": MOTORCYCLE, "car": CAR}
