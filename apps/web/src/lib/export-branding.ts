/** Brand color and logos stamped on exported PDFs. Logos are PNG data URLs, or null when unavailable. */
export type ExportBranding = {
  color: [number, number, number];
  logos: { mark: string; wordmark: string } | null;
};

/** V1 coral, used when the theme does not define `--primary`. */
const FALLBACK_COLOR: ExportBranding["color"] = [201, 106, 58];
const MARK_URL = "/images/openmonetis-mark.svg";
const WORDMARK_URL = "/images/openmonetis-wordmark.svg";
/** Rasterizes the SVG at 4x its intrinsic size so the logos stay sharp in the PDF. */
const RASTER_SCALE = 4;

/** Never throws: any failure falls back to the default color and no logos. */
export async function resolveExportBranding(): Promise<ExportBranding> {
  return { color: resolvePrimaryColor(), logos: await loadLogos() };
}

function resolvePrimaryColor(): ExportBranding["color"] {
  try {
    const cssColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim();
    if (!cssColor) return FALLBACK_COLOR;

    const probe = document.createElement("div");
    probe.style.color = cssColor;
    if (!probe.style.color) return FALLBACK_COLOR;
    document.body.append(probe);
    const computedColor = getComputedStyle(probe).color;
    probe.remove();

    const context = document.createElement("canvas").getContext("2d");
    if (!context) return FALLBACK_COLOR;
    context.fillStyle = computedColor;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return [red, green, blue];
  } catch {
    return FALLBACK_COLOR;
  }
}

async function loadLogos(): Promise<ExportBranding["logos"]> {
  try {
    const [mark, wordmark] = await Promise.all([
      rasterizeSvg(MARK_URL),
      rasterizeSvg(WORDMARK_URL),
    ]);
    return { mark, wordmark };
  } catch {
    return null;
  }
}

async function rasterizeSvg(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth * RASTER_SCALE;
  canvas.height = image.naturalHeight * RASTER_SCALE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
