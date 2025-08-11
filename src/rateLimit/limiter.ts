import Bottleneck from "bottleneck";

export const limiter = new Bottleneck({
  reservoir: 5,                      // starting tokens
  reservoirRefreshAmount: 5,         // refill amount
  reservoirRefreshInterval: 60_000,  // every 60s
  minTime: 400,
  maxConcurrent: 1,
});

// Read remaining tokens (Promise<number|Infinity>)
export async function getReservoir(): Promise<number> {
  const v = await limiter.currentReservoir();
  return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
}

// Hard-set reservoir (useful in tests)
export function setReservoir(n: number): Promise<void> {
  return limiter.updateSettings({ reservoir: n }) as unknown as Promise<void>;
}

// Consume tokens manually if needed
export function consume(n = 1): Promise<number> {
  return limiter.incrementReservoir(-n);
}

// Legacy-compat read (won't be used in prod, but avoids crashes if called)
export async function readReservoirCompat(lim: any = limiter): Promise<number> {
  if (typeof lim.currentReservoir === "function") {
    const v = await lim.currentReservoir();
    return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
  }
  if (typeof lim.reservoir === "function") {
    return await lim.reservoir();
  }
  return Number.POSITIVE_INFINITY;
}