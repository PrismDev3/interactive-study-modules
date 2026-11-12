/** Normalize room flags so a friend-room switch applies the same rules as initial entry. */
export function roomPolicy(room) {
  return {
    pvp: room?.pvp === true,
    noDamage: room?.health === false,
    emotes: room?.emotes !== false,
  };
}
