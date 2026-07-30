/** A single, injectable clock seam for durable generation timestamps. */
let clock: () => Date = () => new Date();

export function now(): Date {
  return clock();
}

/** Test hook; application code always calls now(). */
export function setClockForTests(next: () => Date): void {
  clock = next;
}
