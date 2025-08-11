export const limiter = {
  schedule: <T>(fn: () => Promise<T>) => fn(),
  currentReservoir: jest.fn(async () => 5),
  updateSettings: jest.fn(async (_: { reservoir: number }) => {}),
  incrementReservoir: jest.fn(async (_delta: number) => 0),
  on: jest.fn(),
  running: jest.fn(() => 0),
  queued: jest.fn(() => 0),
  stop: jest.fn(),
  start: jest.fn(),
};

export const getReservoir = jest.fn(async () => 5);
export const setReservoir = jest.fn(async (_n: number) => {});
export const consume = jest.fn(async (_n = 1) => 0);
export const readReservoirCompat = jest.fn(async () => 5);