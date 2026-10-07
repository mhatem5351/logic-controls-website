/**
 * Catalog presentation helpers (src/components/sections/catalog): platform per project (?platform= filter,
 * /technologies/ brand anchors), case-study hero framing (never stretch a small screen capture) and the facts-table
 * de-duplication that replaced the repeated "Technologies used" block.
 */
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { PROJECTS, getProject, type ProjectData } from "~/data/projects";
import { BRANDS } from "~/data/technologies";
import { LOCALES } from "~/i18n/config";
import { HERO_PANEL, SCREEN_GRABS, heroTreatment } from "~/components/sections/catalog/media";
import { firstBrandIn, platformsOf, projectsOnPlatform } from "~/components/sections/catalog/platforms";
import { factPlatformHref, isGenericTech, techRows } from "~/components/sections/catalog/facts";

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
