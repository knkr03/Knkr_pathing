/**
 * AI notice: created with AI assistance (Freebuff / Codebuff). See NOTICE.md.
 *
 * Transient canvas overlay. The renderer is a pure consumer of a planner result:
 * it performs no geometry or collision work. It attaches to canvas.interface
 * after canvasReady and is destroyed on canvasTearDown.
 */

import { getCanvasInterface } from "../compat.mjs";

const COLORS = Object.freeze({
  normal: 0x48c8ff,
  squeeze: 0xffab3d,
  blocked: 0xff5555,
  contact: 0xff7a7a,
  waypoint: 0xdff4ff,
  marker: 0xffab3d,
  label: 0xffffff,
  labelSqueeze: 0xffc46b,
  labelBad: 0xff9a9a
});

function localize(key, fallback) {
  try {
    const value = globalThis.game?.i18n?.localize(key);
    return value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

function formatNumber(value) {
  const rounded = Math.round(Number(value) * 10) / 10;
  return Number.isFinite(rounded) ? String(rounded) : "0";
}

/** Draw a stroked path using PIXI 7 or PIXI 8 APIs. */
function stroke(graphics, width, color, alpha, drawPath) {
  if (typeof graphics.lineStyle === "function") {
    graphics.lineStyle(width, color, alpha);
    drawPath(graphics);
    return;
  }
  drawPath(graphics);
  graphics.stroke({ width, color, alpha });
}

/** Draw a filled circle using PIXI 7 or PIXI 8 APIs. */
function fillCircle(graphics, x, y, radius, color, alpha = 1) {
  if (typeof graphics.beginFill === "function") {
    if (radius <= 0) return;
    graphics.beginFill(color, alpha);
    graphics.drawCircle(x, y, radius);
    graphics.endFill();
    return;
  }
  if (radius <= 0) return;
  if (typeof graphics.circle === "function") graphics.circle(x, y, radius);
  else graphics.drawCircle(x, y, radius);
  graphics.fill({ color, alpha });
}

/** Draw a stroked circle using PIXI 7 or PIXI 8 APIs. */
function strokeCircle(graphics, x, y, radius, width, color, alpha = 1) {
  if (radius <= 0) return;
  stroke(graphics, width, color, alpha, (target) => {
    if (typeof target.circle === "function") target.circle(x, y, radius);
    else target.drawCircle(x, y, radius);
  });
}

export class PreviewRenderer {
  constructor() {
    this.container = null;
    this.graphics = null;
    this.markers = null;
    this.label = null;
  }

  /** @returns {boolean} */
  attach() {
    if (this.container) return true;
    const pixi = globalThis.PIXI;
    const parent = getCanvasInterface();
    if (!pixi?.Container || !pixi?.Graphics || !parent) return false;

    try {
      this.container = new pixi.Container();
      this.container.name = "knkr-pathing-preview";
      this.container.zIndex = 950;
      this.container.interactive = false;
      this.container.eventMode = "none";
      this.container.sortableChildren = false;

      this.graphics = new pixi.Graphics();
      this.graphics.interactive = false;
      this.markers = new pixi.Graphics();
      this.markers.interactive = false;

      this.label = new pixi.Text("", {
        fontFamily: "Signika, sans-serif",
        fontSize: 16,
        fill: COLORS.label,
        stroke: 0x000000,
        strokeThickness: 3,
        align: "left"
      });
      this.label.visible = false;
      this.label.interactive = false;

      this.container.addChild(this.graphics);
      this.container.addChild(this.markers);
      this.container.addChild(this.label);
      parent.addChild(this.container);
      return true;
    } catch (error) {
      console.warn("Knkr Pathing | failed to attach the preview overlay", error);
      this.detach();
      return false;
    }
  }

  detach() {
    try {
      this.container?.parent?.removeChild(this.container);
      this.container?.destroy?.({ children: true });
    } catch (error) {
      console.warn("Knkr Pathing | failed to detach the preview overlay", error);
    }
    this.container = null;
    this.graphics = null;
    this.markers = null;
    this.label = null;
  }

  clear() {
    try {
      this.graphics?.clear();
      this.markers?.clear();
    } catch {
      // Rendering must never break a drag.
    }
    if (this.label) this.label.visible = false;
  }

  /**
   * Draw a complete frame.
   * @param {object | null} plan
   * @param {object} context
   */
  draw(plan, context = {}) {
    if (!this.attach()) return;
    this.clear();
    if (!plan || !this.graphics || !this.markers) return;

    this.drawPath(plan);
    this.drawMarkers(plan, context);
    this.drawIndicators(plan, context);
    this.drawLabel(plan, context);
  }

  /** @param {object} plan */
  drawPath(plan) {
    const segments = Array.isArray(plan.segments) && plan.segments.length > 0
      ? plan.segments
      : null;

    // Dark outline first so the bright route stays visible on any map.
    if (segments) {
      stroke(this.graphics, 8, 0x000000, 0.35, (graphics) => {
        for (const segment of segments) {
          graphics.moveTo(segment.a.x, segment.a.y);
          graphics.lineTo(segment.b.x, segment.b.y);
        }
      });
      for (const segment of segments) {
        const color = segment.mode === "squeeze"
          ? COLORS.squeeze
          : segment.mode === "blocked"
          ? COLORS.blocked
          : COLORS.normal;
        stroke(this.graphics, 4.5, color, 0.95, (graphics) => {
          graphics.moveTo(segment.a.x, segment.a.y);
          graphics.lineTo(segment.b.x, segment.b.y);
        });
      }
    } else if (Array.isArray(plan.points) && plan.points.length > 1) {
      stroke(this.graphics, 6, 0x000000, 0.3, (graphics) => {
        graphics.moveTo(plan.points[0].x, plan.points[0].y);
        for (const point of plan.points.slice(1)) graphics.lineTo(point.x, point.y);
      });
      stroke(this.graphics, 3, COLORS.normal, 0.9, (graphics) => {
        graphics.moveTo(plan.points[0].x, plan.points[0].y);
        for (const point of plan.points.slice(1)) graphics.lineTo(point.x, point.y);
      });
    }

    // Waypoint dots make bends legible without cluttering the line.
    if (Array.isArray(plan.points) && plan.points.length > 2) {
      for (const point of plan.points.slice(1, -1)) {
        fillCircle(this.graphics, point.x, point.y, 3.2, COLORS.waypoint, 0.9);
      }
    }
  }

  /** @param {object} plan @param {object} context */
  drawMarkers(plan, context) {
    if (context.squeezeActive) return;
    if (!Array.isArray(plan.markers)) return;
    for (const marker of plan.markers) {
      const radius = Math.max(4, Number(marker.radius) || 8);
      fillCircle(this.markers, marker.x, marker.y, radius + 5, COLORS.marker, 0.16);
      strokeCircle(this.markers, marker.x, marker.y, radius + 5, 1.5, COLORS.marker, 0.5);
      strokeCircle(this.markers, marker.x, marker.y, radius, 3, COLORS.marker, 0.95);
      fillCircle(this.markers, marker.x, marker.y, Math.max(2, radius * 0.22), COLORS.marker, 0.95);
    }
  }

  /** @param {object} plan @param {object} context */
  drawIndicators(plan, context) {
    const endpoint = plan.endpoint ?? plan.points?.[plan.points.length - 1];

    if (plan.status === "impassable" && plan.goal) {
      const { x, y } = plan.goal;
      stroke(this.graphics, 3.5, COLORS.blocked, 0.95, (graphics) => {
        graphics.moveTo(x - 9, y - 9);
        graphics.lineTo(x + 9, y + 9);
        graphics.moveTo(x + 9, y - 9);
        graphics.lineTo(x - 9, y + 9);
      });
    }

    if (endpoint) {
      if (plan.rotation) {
        strokeCircle(this.graphics, endpoint.x, endpoint.y, 9, 3, COLORS.squeeze, 0.95);
      } else if (plan.status === "contact") {
        strokeCircle(this.graphics, endpoint.x, endpoint.y, 9, 3, COLORS.contact, 0.95);
      } else if (plan.status === "budget") {
        strokeCircle(this.graphics, endpoint.x, endpoint.y, 8, 3, COLORS.squeeze, 0.95);
      } else if (plan.status !== "impassable") {
        fillCircle(this.graphics, endpoint.x, endpoint.y, 4, 0xffffff, 0.95);
      }
    }

    // When squeezing is required but not committed, show where the token is
    // actually constrained (before the gap).
    if (context.appliedCenter && !context.squeezeActive && plan.routeMode === "squeeze") {
      strokeCircle(this.graphics, context.appliedCenter.x, context.appliedCenter.y, 7, 2, 0xffffff, 0.85);
    }
  }

  /** @param {object} plan @param {object} context */
  drawLabel(plan, context) {
    if (!this.label || context.showCostLabel === false) return;

    const units = context.units ?? "ft";
    const distance = formatNumber(plan.totalDistance);
    const cost = formatNumber(plan.totalCost);
    const status = this.statusLabel(plan, context);
    const template = plan.squeezeDistance > 0
      ? localize("KNKR_PATHING.Preview.SqueezeCost", "{distance} {units} · {cost} {units} cost (squeeze ×{multiplier})")
      : localize("KNKR_PATHING.Preview.Cost", "{distance} {units} · {cost} {units} cost");

    let text = template
      .replaceAll("{distance}", distance)
      .replaceAll("{cost}", cost)
      .replaceAll("{units}", units)
      .replaceAll("{multiplier}", formatNumber(context.squeezeMultiplier ?? 2));

    if (status) text = `${status} · ${text}`;
    if (!text) return;

    this.label.text = text;
    this.label.style.fill = plan.status === "impassable" || plan.status === "contact"
      ? COLORS.labelBad
      : plan.squeezeDistance > 0
      ? COLORS.labelSqueeze
      : COLORS.label;
    this.label.visible = true;

    const endpoint = plan.endpoint ?? plan.points?.[plan.points.length - 1] ?? { x: 0, y: 0 };
    let x = endpoint.x + 16;
    let y = endpoint.y - 30;
    const viewWidth = Number(globalThis.canvas?.dimensions?.width) || 0;
    if (viewWidth > 0 && x + this.label.width > viewWidth - 8) {
      x = Math.max(8, endpoint.x - this.label.width - 16);
    }
    y = Math.max(8, y);
    this.label.position.set(x, y);
  }

  /** @param {object} plan @param {object} context */
  statusLabel(plan, context) {
    if (plan.status === "impassable") return localize("KNKR_PATHING.Preview.Blocked", "Blocked");
    if (plan.status === "contact") return localize("KNKR_PATHING.Preview.Contact", "Enemy contact");
    if (plan.status === "budget") return localize("KNKR_PATHING.Preview.Budget", "Out of movement");
    if (plan.routeMode === "squeeze" && !context.squeezeActive) {
      return localize("KNKR_PATHING.Preview.Squeeze", "Squeeze");
    }
    return "";
  }
}
