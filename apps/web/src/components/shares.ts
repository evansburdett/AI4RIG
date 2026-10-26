/** Shares held, from millionths: "2,060", "3.796", "93,572.35". Up to three decimals, trailing zeros dropped. */
export function formatShares(micros: number): string {
  return (micros / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 3 });
}
