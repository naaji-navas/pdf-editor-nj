/**
 * Full copies of common open-license fonts (public/fonts) used when an edit needs glyphs
 * missing from a PDF's embedded subset, so the new text keeps the original look.
 */
const FAMILIES: Record<string, { aliases: string[]; styles: [number, boolean][] }> = {
  LiberationSans: { aliases: ["arial", "helvetica", "helveticaneue", "liberationsans", "arimo"], styles: [[400, false], [700, false], [400, true], [700, true]] },
  LiberationSerif: { aliases: ["timesnewroman", "times", "timesroman", "liberationserif", "tinos"], styles: [[400, false], [700, false], [400, true], [700, true]] },
  LiberationMono: { aliases: ["couriernew", "courier", "liberationmono", "cousine"], styles: [[400, false], [700, false], [400, true], [700, true]] },
  Carlito: { aliases: ["calibri", "carlito"], styles: [[400, false], [700, false], [400, true], [700, true]] },
  DejaVuSans: { aliases: ["dejavusans"], styles: [[400, false], [700, false], [400, true], [700, true]] },
  Lato: { aliases: ["lato"], styles: [[300, false], [400, false], [700, false], [400, true], [700, true]] },
  OpenSans: { aliases: ["opensans"], styles: [[300, false], [400, false], [600, false], [700, false], [400, true], [700, true]] },
  Poppins: { aliases: ["poppins"], styles: [[300, false], [400, false], [500, false], [600, false], [700, false], [400, true], [700, true]] },
  NotoSans: { aliases: ["notosans"], styles: [[300, false], [400, false], [500, false], [600, false], [700, false], [400, true], [700, true]] },
  Roboto: { aliases: ["roboto"], styles: [[300, false], [400, false], [500, false], [600, false], [700, false], [400, true], [700, true]] },
  Inter: { aliases: ["inter"], styles: [[300, false], [400, false], [500, false], [600, false], [700, false], [400, true], [700, true]] },
  Montserrat: { aliases: ["montserrat"], styles: [[300, false], [400, false], [500, false], [600, false], [700, false], [400, true], [700, true]] },
};

const STYLE_WORDS = /(regular|normal|book|roman|italic|oblique|thin|hairline|extralight|ultralight|light|medium|semibold|demibold|demi|extrabold|ultrabold|bold|black|heavy)$/;

function matchFamily(baseFont: string) {
  let key = baseFont
    .split(/[-,]/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(psmt|mt|ps)$/, "");
  for (let i = 0; i < 4 && key; i++) {
    const family = Object.entries(FAMILIES).find(([, f]) => f.aliases.includes(key));
    if (family) return family;
    key = key.replace(STYLE_WORDS, "");
  }
  return null;
}

export function weightOf(baseFont: string) {
  const name = baseFont.toLowerCase().replace(/[^a-z]/g, "");
  if (/thin|hairline/.test(name)) return 100;
  if (/extralight|ultralight/.test(name)) return 200;
  if (/light/.test(name)) return 300;
  if (/semibold|demibold|demi/.test(name)) return 600;
  if (/extrabold|ultrabold/.test(name)) return 800;
  if (/black|heavy/.test(name)) return 900;
  if (/bold/.test(name)) return 700;
  if (/medium/.test(name)) return 500;
  return 400;
}

export const isItalicName = (baseFont: string) => /italic|oblique/i.test(baseFont);

/** File in public/fonts closest to the original font, or null when the family isn't bundled. */
export function bundledFontFor(baseFont: string, override: { bold?: boolean; italic?: boolean } = {}) {
  const match = matchFamily(baseFont);
  if (!match) return null;
  const [family, { styles }] = match;
  let weight = weightOf(baseFont);
  if (override.bold === true) weight = Math.max(weight, 700);
  else if (override.bold === false && weight >= 600) weight = 400;
  const italic = override.italic ?? isItalicName(baseFont);
  const candidates = styles.filter(([, it]) => it === italic);
  const pool = candidates.length ? candidates : styles;
  // Ties go to the lighter weight; a too-heavy substitute is more noticeable
  const [w, it] = pool.reduce((best, s) => (Math.abs(s[0] - weight) < Math.abs(best[0] - weight) ? s : best));
  return `${family}-${w}${it ? "i" : ""}.ttf`;
}
