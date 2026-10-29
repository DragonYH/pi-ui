// Shared geometry keeps the first loading frame and welcome header aligned.
export const BRAND_COLUMN_WIDTH = 18;
export const GRID_COLUMN_GAP = 4;
export const MIN_RESOURCE_COLUMN_WIDTH = 44;
export const WELCOME_TOP_PADDING = 2;
export const WELCOME_BOTTOM_PADDING = 1;

export function getWelcomeLayout(width: number): {
  width: number;
  leftPadding: number;
  brandWidth: number;
  wide: boolean;
} {
  const margin = width >= 100 ? 4 : width >= 40 ? 2 : width >= 18 ? 1 : 0;
  const innerWidth = Math.max(1, width - margin * 2);
  const brandWidth = Math.max(BRAND_COLUMN_WIDTH, Math.min(30, Math.floor(innerWidth * 0.28)));
  return {
    width: innerWidth,
    leftPadding: Math.max(0, Math.floor((width - innerWidth) / 2)),
    brandWidth,
    wide: innerWidth >= brandWidth + GRID_COLUMN_GAP + MIN_RESOURCE_COLUMN_WIDTH,
  };
}
