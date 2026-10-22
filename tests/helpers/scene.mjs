// AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.

/** Scene scale used by all fixtures: 100 px per 5 ft. */
export const UNITS_PER_PIXEL = 0.05;

/** Medium token: 5 ft across on the 100 px / 5 ft scale. */
export const MEDIUM = { radius: 50 };

/**
 * Build a Foundry-like wall document.
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 * @param {object} [options]
 */
export function wall(x1, y1, x2, y2, options = {}) {
  return {
    id: options.id ?? `wall-${x1}-${y1}-${x2}-${y2}`,
    c: [x1, y1, x2, y2],
    move: options.move ?? 1,
    door: options.door ?? 0,
    ds: options.ds ?? 0,
    dir: options.dir ?? 0
  };
}

/**
 * A vertical barrier with a central gap of the given width.
 * @param {number} gap Pixels between the two wall endpoints.
 * @param {object} [options]
 */
export function gapWalls(gap, options = {}) {
  const half = gap / 2;
  return [
    wall(0, -3000, 0, -half, { id: "gap-top", ...options }),
    wall(0, half, 0, 3000, { id: "gap-bottom", ...options })
  ];
}

/**
 * Closed room with a single central opening in its left wall. Unlike a finite
 * barrier, the only route inside is through the gap, which is what a token's
 * size limit must be tested against.
 * @param {number} gap Gap width in pixels.
 * @param {object} [options]
 */
export function gapRoom(gap, { left = -200, top = -200, right = 200, bottom = 200 } = {}) {
  const half = gap / 2;
  return [
    wall(left, top, right, top, { id: "room-top" }),
    wall(right, top, right, bottom, { id: "room-right" }),
    wall(right, bottom, left, bottom, { id: "room-bottom" }),
    wall(left, bottom, left, half, { id: "room-left-lower" }),
    wall(left, -half, left, top, { id: "room-left-upper" })
  ];
}

/**
 * Closed rectangular room with wall thickness approximated by four segments.
 * @param {number} left @param {number} top @param {number} right @param {number} bottom
 */
export function closedRoom(left, top, right, bottom) {
  return [
    wall(left, top, right, top, { id: "room-top" }),
    wall(right, top, right, bottom, { id: "room-right" }),
    wall(right, bottom, left, bottom, { id: "room-bottom" }),
    wall(left, bottom, left, top, { id: "room-left" })
  ];
}

/** @param {string} id @param {number} x @param {number} y @param {number} radius */
export function enemy(id, x, y, radius = 50) {
  return { id, center: { x, y }, radius };
}

/** @param {object} overrides */
export function mediumPlanOptions(overrides = {}) {
  return {
    unitsPerPixel: UNITS_PER_PIXEL,
    ...MEDIUM,
    ...overrides
  };
}
