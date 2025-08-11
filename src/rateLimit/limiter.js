const Bottleneck = require('bottleneck');

const limiter = new Bottleneck({
  reservoir: 5,                      // starting tokens
  reservoirRefreshAmount: 5,         // refill amount
  reservoirRefreshInterval: 60_000,  // every 60s
  minTime: 400,
  maxConcurrent: 1,
});

// Read remaining tokens (Promise<number|Infinity>)
async function getReservoir() {
  const v = await limiter.currentReservoir();
  return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
}

// Hard-set reservoir (useful in tests)
function setReservoir(n) {
  return limiter.updateSettings({ reservoir: n });
}

// Consume tokens manually if needed
function consume(n = 1) {
  return limiter.incrementReservoir(-n);
}

// Legacy-compat read (won't be used in prod, but avoids crashes if called)
async function readReservoirCompat(lim = limiter) {
  if (typeof lim.currentReservoir === "function") {
    const v = await lim.currentReservoir();
    return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
  }
  if (typeof lim.reservoir === "function") {
    return await lim.reservoir();
  }
  return Number.POSITIVE_INFINITY;
}

module.exports = {
  limiter,
  getReservoir,
  setReservoir,
  consume,
  readReservoirCompat
};