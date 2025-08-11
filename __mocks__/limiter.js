const limiter = {
  schedule: (fn) => fn(),
  currentReservoir: jest.fn(async () => 5),
  updateSettings: jest.fn(async (_) => {}),
  incrementReservoir: jest.fn(async (_delta) => 0),
  on: jest.fn(),
  running: jest.fn(() => 0),
  queued: jest.fn(() => 0),
  stop: jest.fn(),
  start: jest.fn(),
};

const getReservoir = jest.fn(async () => 5);
const setReservoir = jest.fn(async (_n) => {});
const consume = jest.fn(async (_n = 1) => 0);
const readReservoirCompat = jest.fn(async () => 5);

module.exports = {
  limiter,
  getReservoir,
  setReservoir,
  consume,
  readReservoirCompat
};