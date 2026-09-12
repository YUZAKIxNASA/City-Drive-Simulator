// All tunable numbers for the game live here.
// Distances are metres, times are seconds, angles are radians.

export const CITY = {
  gridCount: 5, // 5 x 5 intersections -> 4 x 4 city blocks
  blockSize: 64, // distance between two intersections
  roadWidth: 14,
  laneOffset: 3.6, // distance from road centre line to a lane centre
  parkOffset: 5.9, // distance from road centre line to the parking strip
  sidewalkWidth: 3.2,
  curbHeight: 0.17,
};

CITY.half = ((CITY.gridCount - 1) * CITY.blockSize) / 2; // 128
CITY.bound = CITY.half + CITY.roadWidth / 2 + 1.4; // outer wall position
CITY.blockInner = CITY.blockSize - CITY.roadWidth; // 50 -> raised block platform
CITY.plot = CITY.blockInner - CITY.sidewalkWidth * 2; // 43.6 -> buildable area

export const CAR = {
  length: 4.9,
  width: 1.86,
  height: 1.47,
  wheelBase: 2.9,
  track: 1.6,
  wheelRadius: 0.34,
  wheelWidth: 0.25,

  maxSteer: 0.56,
  steerSpeed: 5.2, // how fast the wheels turn to the target angle
  steerReturn: 7.0,
  highSpeedSteerFactor: 0.68, // steering reduction at top speed

  maxSpeed: 56, // m/s hard limit (~200 km/h)
  peakAccel: 8.5, // m/s^2 below the power band (0-100 km/h in about 4.1 s)
  powerVelocity: 14, // constant power kicks in above this speed
  brakeDecel: 11.5,
  reverseAccel: 5.0,
  maxReverse: 11,

  grip: 11.5, // lateral grip in m/s^2
  handbrakeGrip: 3.4,
  rollingResist: 0.011,
  airDrag: 0.0007,

  bodyRoll: 0.055,
  bodyPitch: 0.05,
};

export const TRAFFIC = {
  count: 22,
  countMobile: 12,
  cruise: 12.0, // m/s (~43 km/h)
  cruiseVariation: 3.0,
  accel: 3.4,
  decel: 6.5,
  safeGap: 9.0,
  cornerBlend: 9.0,
};

export const SIGNALS = {
  green: 9.5,
  yellow: 2.4,
};

export const REWARDS = {
  checkpoint: 260,
  delivery: 420,
  route: 700,
  parking: 620,
  timeBonusPerSecond: 12,
  crashPenalty: 40,
  redLightPenalty: 25,
};

export const COLORS = {
  sunDay: 0xfff0dc,
  sunNight: 0x9fb6e0,
  ambientDay: 0x8fb2d8,
  ambientNight: 0x1c2438,
  groundDay: 0x4a4f42,
  groundNight: 0x14161c,
  fogDay: 0xc3d6e6,
  fogNight: 0x0a0e18,
  road: 0x2a2c31,
};

export const CAR_PAINTS = [
  0xc9ced6, 0x1b1d21, 0x8d1116, 0x11305c, 0x2c5c3a, 0xb9b3a6, 0x5a5f68, 0xd0a03a,
  0x6e2530, 0x36414d, 0xe4e6ea, 0x2f2a35,
];
