export function formatPrice(won: number) {
  return `${won.toLocaleString("ko-KR")}원`;
}

export function formatDistance(meters: number) {
  const rounded = Math.round(meters);
  if (rounded < 1000) return `${rounded}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
