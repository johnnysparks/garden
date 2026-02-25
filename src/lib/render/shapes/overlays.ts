// Disease overlay generators

// ── Types ──────────────────────────────────────────────────────────────────

/** Input parameters for generating a disease overlay. */
export interface OverlayParams {
  overlayId: string;
  intensity: number;   // 0–1, maps to disease severity or stage progression
  plantWidth: number;  // bounding box width of the plant SVG
  plantHeight: number;
  seed: number;        // instance seed for visual variation
}

/** A single SVG element emitted by an overlay generator. */
export interface OverlayElement {
  type: 'circle' | 'path' | 'rect';
  attrs: Record<string, string | number>;
}

// ── Generator dispatch ─────────────────────────────────────────────────────

/**
 * Generate SVG overlay elements for a given disease visual overlay ID.
 * Returns an empty array for unknown overlay IDs.
 */
export function generateOverlay(params: OverlayParams): OverlayElement[] {
  switch (params.overlayId) {
    case 'interveinal_yellowing':
      return [];
    case 'leaf_spots':
      return [];
    case 'concentric_rings':
      return [];
    case 'powdery_coating':
      return [];
    case 'wilting':
      return [];
    case 'fruit_base_rot':
      return [];
    case 'stem_lesions':
      return [];
    case 'insect_clusters':
      return [];
    case 'yellowing_uniform':
      return [];
    case 'purple_tint':
      return [];
    case 'brown_edges':
      return [];
    default:
      return [];
  }
}
