/**
 * AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
 *
 * Token footprint model. A token is represented by a conservative circular
 * footprint derived from its displayed dimensions, plus a smaller squeeze
 * profile derived from the D&D 5e one-size-smaller rule.
 */

const MIN_RADIUS = 0.5;

/**
 * @typedef {object} Footprint
 * @property {number} normalRadius Normal collision radius in pixels.
 * @property {number} squeezeRadius Reduced radius in pixels.
 * @property {number} diameter Normal diameter in pixels.
 * @property {number} squeezeFactor Configured factor (0, 1].
 */

/**
 * Build footprint profiles from displayed token dimensions.
 *
 * `widthPx`/`heightPx` are the document dimensions in canvas pixels, before
 * texture scale. Non-square tokens use the circumscribed circle (max half-extent)
 * so obstacles are never underestimated.
 *
 * @param {object} options
 * @param {number} options.widthPx
 * @param {number} options.heightPx
 * @param {number} [options.textureScaleX]
 * @param {number} [options.textureScaleY]
 * @param {number} [options.shapeRadiusPx] Explicit rendered circle radius, when available.
 * @param {number} [options.squeezeFactor] D&D 5e size reduction factor, default 0.5.
 * @returns {Footprint}
 */
export function createFootprint({
  widthPx = 100,
  heightPx = 100,
  textureScaleX = 1,
  textureScaleY = 1,
  shapeRadiusPx = null,
  squeezeFactor = 0.5
} = {}) {
  const width = Math.abs(Number(widthPx) || 0) * Math.abs(Number(textureScaleX) || 1);
  const height = Math.abs(Number(heightPx) || 0) * Math.abs(Number(textureScaleY) || 1);
  const explicitRadius = Number(shapeRadiusPx);
  const radius = Number.isFinite(explicitRadius) && explicitRadius > 0
    ? explicitRadius
    : Math.max(MIN_RADIUS, Math.max(width, height) / 2);

  const factor = Math.min(1, Math.max(0.05, Number(squeezeFactor) || 0.5));
  const squeezeRadius = Math.max(MIN_RADIUS, radius * factor);

  return {
    normalRadius: radius,
    squeezeRadius: Math.min(radius, squeezeRadius),
    diameter: radius * 2,
    squeezeFactor: factor
  };
}

/**
 * Convert a distance in scene units to pixels.
 * @param {number} units
 * @param {number} unitsPerPixel Scene units represented by one pixel.
 * @returns {number}
 */
export function unitsToPixels(units, unitsPerPixel) {
  const factor = Number(unitsPerPixel);
  if (!Number.isFinite(factor) || factor <= 0) return 0;
  return Number(units) / factor;
}

/**
 * Convert a distance in pixels to scene units.
 * @param {number} pixels
 * @param {number} unitsPerPixel
 * @returns {number}
 */
export function pixelsToUnits(pixels, unitsPerPixel) {
  const factor = Number(unitsPerPixel);
  if (!Number.isFinite(factor) || factor <= 0) return 0;
  return Number(pixels) * factor;
}

/**
 * Scene units represented by one pixel, from a Foundry-like grid config.
 * Gridless scenes still carry a nominal size/distance used for measurement.
 * @param {{size?: number, distance?: number}} grid
 * @returns {number}
 */
export function unitsPerPixelFromGrid(grid) {
  const size = Number(grid?.size) || 100;
  const distance = Number(grid?.distance) || 5;
  return distance / size;
}
