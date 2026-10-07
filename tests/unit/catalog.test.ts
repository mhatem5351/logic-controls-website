/**
 * Catalog presentation helpers (src/components/sections/catalog): platform per project (?platform= filter,
 * /technologies/ brand anchors), case-study hero framing (never stretch a small screen capture), the facts-table
 * de-duplication that replaced the repeated "Technologies used" block, the relevance-first proof links on the
 * industries / technologies hubs (CS3-03) and the card image `sizes` / widths for large monitors (DEV3-04).
 */
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { PROJECTS, getProject, type ProjectData } from "~/data/projects";
import { BRANDS } from "~/data/technologies";
import { LOCALES } from "~/i18n/config";
import { HERO_PANEL, SCREEN_GRABS, heroTreatment } from "~/components/sections/catalog/media";
import { firstBrandIn, platformsOf, projectsOnPlatform } from "~/components/sections/catalog/platforms";
import { factPlatformHref, isGenericTech, techRows } from "~/components/sections/catalog/facts";
import { industryProof, industrySlugs, platformProof } from "~/components/sections/catalog/catalog";
import { CARD_SIZES_3, CARD_SIZES_4, CARD_WIDTHS } from "~/components/sections/catalog/sizes";

const p = (slug: string) => getProject(slug)!;

describe("platforms", () => {
  it("derives the platform brands from a project's technologies", () => {
    expect(platformsOf(p("beverage-syrup-jet-mixing"))).toEqual(["siemens"]);
    expect(platformsOf(p("labeling-machine-delta-wecon"))).toEqual(["schneider-electric", "delta", "wecon"]);
    expect(platformsOf(p("shampoo-filling-delta-wecon"))).toEqual(["delta", "ls-electric", "wecon"]);
  });
  it("every platform on the technologies page has at least one case study to link to", () => {
    for (const b of BRANDS) expect(projectsOnPlatform(b.slug, PROJECTS).length, b.slug).toBeGreaterThan(0);
  });
  it("matches whole brand names only, and returns the first one in the text", () => {
    expect(firstBrandIn("Schneider Electric stepper drives and an Altivar VFD")?.slug).toBe("schneider-electric");
    expect(firstBrandIn("2 Yaskawa VFDs for pump speed")).toBeUndefined();
    expect(firstBrandIn("Wecon HMI with a Delta PLC")?.slug).toBe("wecon");
    expect(firstBrandIn("Deltaic")).toBeUndefined();
  });
});

describe("case-study hero media", () => {
  /* Under Vitest an image import is its path (no ImageMetadata): read the real pixel size from the file. */
  const sized = new Map<string, Pick<ProjectData, "slug" | "cover">>();
  beforeAll(async () => {
    for (const pr of PROJECTS) {
      const path = String(pr.cover.image).replace(/^\//, "");
      const { width, height } = await sharp(path).metadata();
      sized.set(pr.slug, { slug: pr.slug, cover: { key: pr.cover.key, image: { ...(pr.cover.image as object), width, height } as never } });
    }
  });
  const t = (slug: string) => heroTreatment(sized.get(slug)!);
  it("frames screen captures and photos too small for the hero panel, never stretches them", () => {
    expect(t("cheese-cooker-recipes")).toBe("photo"); // the panel photo (561×1100) leads since VIS2-06
    expect(t("concrete-batching-plant-scada")).toBe("screen");
    expect(t("pipe-make-break-test-rig")).toBe("screen");
    expect(t("milk-pasteurizer")).toBe("photo");
    expect(t("beverage-syrup-jet-mixing")).toBe("photo");
    expect(t("tablet-coating-scada")).toBe("cover");
  });
  it("every full-bleed ('cover') hero photo is at least the panel's size (no upscaling on a 1x screen)", () => {
    for (const pr of sized.values()) {
      if (heroTreatment(pr) !== "cover") continue;
      expect(pr.cover.image.width, pr.slug).toBeGreaterThanOrEqual(HERO_PANEL.width);
      expect(pr.cover.image.height, pr.slug).toBeGreaterThanOrEqual(HERO_PANEL.height);
    }
  });
  it("every screen-capture key names a real image of that project", () => {
    for (const [slug, keys] of Object.entries(SCREEN_GRABS)) {
      const pr = p(slug);
      const all = [pr.cover, ...pr.gallery].map((i) => i.key);
      for (const k of keys ?? []) expect(all, `${slug}/${k}`).toContain(k);
    }
  });
});

describe("facts table", () => {
  it("drops chips that only repeat their category", () => {
    expect(isGenericTech("PLC")).toBe(true);
    expect(isGenericTech("Motion control")).toBe(true);
    expect(isGenericTech("HMI")).toBe(true);
    expect(isGenericTech("Wecon HMI")).toBe(false);
    expect(isGenericTech("Industrial Ethernet switch")).toBe(false);
  });
  it("adds only the technology groups the facts do not state", () => {
    expect(techRows("bottle-printing-motion-retrofit", p("bottle-printing-motion-retrofit").technologies)).toEqual([]);
    expect(techRows("tablet-coating-scada", p("tablet-coating-scada").technologies)).toEqual([]);
    expect(techRows("pasteurizer-cip-recipes", p("pasteurizer-cip-recipes").technologies)).toEqual([
      { group: "other", items: ["Schneider Electric C60N circuit breakers"] },
    ]);
  });
  it("links a fact naming a platform to that brand on /technologies/, the same cell in every locale", () => {
    for (const l of LOCALES) {
      expect(factPlatformHref(l, "beverage-syrup-jet-mixing", 2)).toBe(`/${l}/technologies/#siemens`);
      expect(factPlatformHref(l, "beverage-syrup-jet-mixing", 0)).toBeUndefined();
    }
  });
});

describe("proof links on the hubs (relevance first, CS3-03)", () => {
  const slugsOf = (list: readonly ProjectData[]) => list.map((x) => x.slug);
  for (const l of LOCALES) {
    const tiles = industryProof(l, industrySlugs(l), 2);
    it(`${l}: an industry tile leads with projects whose primary industry it is, built by us, without needless repeats`, () => {
      // the labeling machine (packaging is its primary industry) is the packaging tile's first proof
      expect(slugsOf(tiles["packaging-labeling"])[0]).toBe("labeling-machine-delta-wecon");
      expect(slugsOf(tiles.pharmaceutical)).toContain("tablet-coating-scada");
      // a commissioning-only job never displaces control systems we built for that industry
      expect(slugsOf(tiles["food-beverage"])).not.toContain("anaerobic-waste-treatment-commissioning");
      for (const [slug, list] of Object.entries(tiles)) {
        const primary = PROJECTS.filter((x) => x.industries[0] === slug);
        if (primary.length) expect(list[0]!.industries[0], slug).toBe(slug);
      }
      // the cross-tagged bottle printing retrofit is not repeated in every tile it is tagged with
      const appearances = Object.values(tiles).filter((list) => slugsOf(list).includes("bottle-printing-motion-retrofit")).length;
      expect(appearances).toBeLessThanOrEqual(2);
    });
    it(`${l}: a platform row links projects where the brand is the PLC / SCADA first`, () => {
      const rows = platformProof(l, 3);
      // the Siemens text cites tablet coating and concrete batching (PLC + WinCC SCADA): both are linked
      expect(slugsOf(rows.siemens)).toEqual(expect.arrayContaining(["tablet-coating-scada", "concrete-batching-plant-scada"]));
      expect(slugsOf(rows.siemens)).not.toContain("anaerobic-waste-treatment-commissioning");
      // LS Electric: the PLC jobs before the one where it is only a drive
      expect(slugsOf(rows["ls-electric"]).at(-1)).toBe("shampoo-filling-delta-wecon");
      for (const b of BRANDS) {
        const all = projectsOnPlatform(b.slug, PROJECTS);
        expect(rows[b.slug].length, b.slug).toBe(Math.min(3, all.length));
        for (const x of rows[b.slug]) expect(platformsOf(x), `${b.slug}: ${x.slug}`).toContain(b.slug);
      }
    });
  }
  it("is deterministic (same input, same picks)", () => {
    expect(industryProof("en", industrySlugs("en"), 2)).toEqual(industryProof("en", industrySlugs("en"), 2));
    expect(platformProof("ar", 3)).toEqual(platformProof("ar", 3));
  });
});

describe("card image sizes (DEV3-04)", () => {
  /** "(min-width: 1920px) 450px, …" → [[1920, "450px"], …]; the browser takes the FIRST slot whose query matches. */
  const slots = (sizes: string) => [...sizes.matchAll(/\(min-width: (\d+)px\) ([^,]+)/g)].map((m) => [Number(m[1]), m[2]!.trim()] as const);
  it("large monitors get their own slots, widest first, growing with the viewport", () => {
    for (const sizes of [CARD_SIZES_3, CARD_SIZES_4]) {
      const s = slots(sizes);
      expect(s.slice(0, 3).map(([w]) => w)).toEqual([2560, 1920, 1280]);
      const px = s.slice(0, 3).map(([, v]) => parseFloat(v));
      expect(px[0]).toBeGreaterThan(px[1]!);
      expect(px[1]).toBeGreaterThan(px[2]!);
      for (let i = 1; i < s.length; i++) expect(s[i]![0], sizes).toBeLessThan(s[i - 1]![0]);
    }
  });
  it("a 2x large monitor has a candidate: 1000w for a ~470px card, up to 1200w", () => {
    expect(CARD_WIDTHS).toEqual([...CARD_WIDTHS].sort((a, b) => a - b));
    expect(CARD_WIDTHS).toEqual(expect.arrayContaining([1000, 1200]));
    const widest = slots(CARD_SIZES_3)[0]![1];
    expect(Math.max(...CARD_WIDTHS)).toBeGreaterThanOrEqual(2 * parseFloat(widest));
  });
});
