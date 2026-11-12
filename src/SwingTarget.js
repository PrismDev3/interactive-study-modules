/** Pure target math for a fallback web when no building surface is in range. */
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/** Keep the fallback ahead of the player, with a little more reach at speed. */
export function makeSkyAnchor(origin, forward, velocity) {
  const flatSpeed = Math.hypot(velocity.x, velocity.z);
  const distance = clamp(28 + flatSpeed * 0.28, 28, 42);
  const height = clamp(24 + Math.max(0, velocity.y) * 0.15, 24, 30);
  return {
    x: origin.x + forward.x * distance,
    y: origin.y + height,
    z: origin.z + forward.z * distance,
  };
}
