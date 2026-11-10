import type { GymInfo } from "./types";

/** Snapshot extracted from arkkies.com/app.bundle.js in the Nov 2026 HAR. */
export const FALLBACK_GYMS: Record<string, { label: string; longLabel: string }> = {
  AMOWLH01: { label: "Woodleigh", longLabel: "Ark Move • Woodleigh" },
  ALIDTE01: { label: "Downtown East", longLabel: "Ark Liv • Downtown East" },
  APOBIS01: { label: "Bishan", longLabel: "Ark Pod • Bishan" },
  ABLPUN01: { label: "Punggol (Tebing Lane)", longLabel: "Ark Bloc • Punggol (Tebing Lane)" },
  AGRBIS01: { label: "Bishan", longLabel: "Ark Grit • Bishan" },
  AGRHUG01: { label: "Hougang 423", longLabel: "Ark Grit • Hougang 423" },
  AGRHUG02: { label: "Hougang 422", longLabel: "Ark Grit • Hougang 422" },
  AGRCCK01: { label: "Choa Chu Kang", longLabel: "Ark Grit • Choa Chu Kang" },
  AGRJUR01: { label: "Jurong West 722", longLabel: "Ark Grit • Jurong West 722" },
  AGRJUR02: { label: "Jurong West 724", longLabel: "Ark Grit • Jurong West 724" },
  AGRGYL01: { label: "Geylang", longLabel: "Ark Grit • Geylang" },
  AGRKHG01: { label: "Keat Hong", longLabel: "Ark Grit • Keat Hong" },
  AGRSRN01: { label: "Serangoon North 534", longLabel: "Ark Grit • Serangoon North 534" },
  AGRSRN02: { label: "Serangoon North 533", longLabel: "Ark Grit • Serangoon North 533" },
  AGRBGK01: { label: "Buangkok", longLabel: "Ark Grit • Buangkok" },
  AMOJSC01: { label: "Jurong Spring CC", longLabel: "Ark Grit • Jurong Spring CC" },
  AGRDTE01: { label: "Downtown East", longLabel: "Ark Grit • Downtown East" },
  AGRWDL01: { label: "Woodlands", longLabel: "Ark Grit • Woodlands" },
  AGRBSN01: { label: "Bishan North", longLabel: "Ark Grit • Bishan North" },
  AGRTLA01: { label: "Telok Ayer", longLabel: "Ark Grit • Telok Ayer" },
  AGRMRM01: { label: "Marymount", longLabel: "Ark Grit • Marymount" },
  AGRFRP01: { label: "Farrer Park", longLabel: "Ark Grit • Farrer Park" },
  AGRFCN01: { label: "Fuchun", longLabel: "Ark Grit • Fuchun" },
};

const BUNDLE_ENTRY_RE =
  /\{label:"([^"]+)",longLabel:"([^"]+)",type:"navigate",navigateTo:"\/portal\/outlet\?outlet-id=([A-Z0-9]+)"/g;

export function parseGymCatalog(bundleJs: string): Record<string, { label: string; longLabel: string }> {
  const catalog: Record<string, { label: string; longLabel: string }> = {};
  for (const match of bundleJs.matchAll(BUNDLE_ENTRY_RE)) {
    const [, label, longLabel, id] = match;
    if (!catalog[id]) catalog[id] = { label, longLabel };
  }
  return catalog;
}

export function resolveGym(
  id: string,
  catalog: Record<string, { label: string; longLabel: string }> = {},
): GymInfo {
  const entry = catalog[id] ?? FALLBACK_GYMS[id];
  if (!entry) {
    return { id, label: id, longLabel: id, name: id };
  }
  return { id, label: entry.label, longLabel: entry.longLabel, name: entry.longLabel };
}

export function resolveGyms(
  ids: string[],
  catalog: Record<string, { label: string; longLabel: string }> = {},
): GymInfo[] {
  return [...new Set(ids.filter(Boolean))]
    .map((id) => resolveGym(id, catalog))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export function parseAllowedOutletIds(allowed: string | undefined, homeId?: string): string[] {
  const ids = (allowed ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (homeId && !ids.includes(homeId)) ids.unshift(homeId);
  return ids;
}

const BUNDLE_URL = "https://arkkies.com/app.bundle.js";
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000;

type CatalogCache = {
  at: number;
  catalog: Record<string, { label: string; longLabel: string }>;
};

let memoryCache: CatalogCache | null = null;

export function resetGymCatalogCache(): void {
  memoryCache = null;
}

async function readCacheApi(cache: Cache, request: Request): Promise<string | null> {
  const cached = await cache.match(request);
  if (!cached?.ok) return null;
  return cached.text();
}

export async function loadGymCatalog(fetchFn: typeof fetch, cache?: Cache): Promise<Record<string, { label: string; longLabel: string }>> {
  if (memoryCache && Date.now() - memoryCache.at < MEMORY_TTL_MS) {
    return memoryCache.catalog;
  }
  const request = new Request(BUNDLE_URL, {
    headers: { Accept: "application/javascript, text/javascript, */*" },
  });
  try {
    let source: string | null = cache ? await readCacheApi(cache, request) : null;
    if (!source) {
      const response = await fetchFn(request);
      if (response.ok) {
        source = await response.clone().text();
        if (cache) {
          const toStore = new Response(source, {
            headers: {
              "Content-Type": "text/javascript",
              "Cache-Control": "public, max-age=21600",
            },
          });
          try {
            await cache.put(request, toStore);
          } catch {
            // Cache API is best-effort.
          }
        }
      }
    }
    if (source) {
      const parsed = parseGymCatalog(source);
      if (Object.keys(parsed).length > 0) {
        memoryCache = { at: Date.now(), catalog: parsed };
        return parsed;
      }
    }
  } catch {
    // Fall back to the bundled snapshot.
  }
  return FALLBACK_GYMS;
}

export function catalogFromOutletList(
  outlets: Array<{ id?: string; name?: string }>,
): Record<string, { label: string; longLabel: string }> {
  const catalog: Record<string, { label: string; longLabel: string }> = {};
  for (const outlet of outlets) {
    if (!outlet.id || !outlet.name) continue;
    const name = outlet.name.trim();
    const parts = name.split(" @ ");
    const label = parts.length > 1 ? parts.slice(1).join(" @ ") : name;
    catalog[outlet.id] = { label, longLabel: name };
  }
  return catalog;
}

export type OutletRecord = {
  id?: string;
  name?: string;
  brand?: { name?: string } | string | null;
};

const GYM_ID_PREFIXES = /^(AGR|AMO|ALI|APO|ABL)/i;

function brandName(outlet: OutletRecord): string {
  if (!outlet.brand) return "";
  if (typeof outlet.brand === "string") return outlet.brand;
  return outlet.brand.name ?? "";
}

/** Physical gym locations, excluding product-only entries such as Ark+ or Corp+. */
export function isGymOutlet(outlet: OutletRecord): boolean {
  const id = (outlet.id ?? "").trim();
  const name = (outlet.name ?? "").trim();
  if (!id || !name) return false;
  const productOnly = /^(ark\+?|corp\+?)$/i.test(name) || /premium access|corporate/i.test(brandName(outlet));
  if (productOnly) return false;
  if (name.includes(" @ ")) return true;
  if (GYM_ID_PREFIXES.test(id)) return true;
  return false;
}

export function filterGymOutlets(outlets: OutletRecord[]): OutletRecord[] {
  const named = outlets.filter((outlet) => outlet.id && outlet.name?.trim());
  const gyms = named.filter(isGymOutlet);
  return gyms.length > 0 ? gyms : named;
}

const OUTLETS_URL = "https://api.arkkies.com/v2/brand/outlet";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

type PublicGymsCache = { at: number; gyms: GymInfo[] };
let publicGymsCache: PublicGymsCache | null = null;

export function resetPublicGymsCache(): void {
  publicGymsCache = null;
}

export function resetGymCaches(): void {
  resetGymCatalogCache();
  resetPublicGymsCache();
}

export async function listPublicGyms(
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
  cache?: Cache,
): Promise<GymInfo[]> {
  if (publicGymsCache && Date.now() - publicGymsCache.at < MEMORY_TTL_MS) {
    return publicGymsCache.gyms;
  }

  let outlets: OutletRecord[] = [];
  const request = new Request(OUTLETS_URL, {
    headers: {
      "User-Agent": UA,
      Origin: "https://arkkies.com",
      Referer: "https://arkkies.com/",
      Accept: "application/json",
    },
  });
  try {
    let source: string | null = cache ? await readCacheApi(cache, request) : null;
    if (!source) {
      const response = await fetchFn(request);
      if (response.ok) {
        source = await response.clone().text();
        if (cache) {
          const toStore = new Response(source, {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=21600",
            },
          });
          try {
            await cache.put(request, toStore);
          } catch {
            // Cache API is best-effort.
          }
        }
      }
    }
    if (source) {
      const body = JSON.parse(source) as { outlets?: OutletRecord[] };
      outlets = body.outlets ?? [];
    }
  } catch {
    outlets = [];
  }

  const bundle = await loadGymCatalog(fetchFn, cache);
  const catalog = { ...FALLBACK_GYMS, ...bundle, ...catalogFromOutletList(outlets) };
  const sourceIds = outlets.length
    ? filterGymOutlets(outlets).map((outlet) => outlet.id).filter((id): id is string => Boolean(id))
    : filterGymOutlets(
        Object.entries(catalog).map(([id, entry]) => ({ id, name: entry.longLabel })),
      ).map((outlet) => outlet.id!);
  const gyms = resolveGyms(sourceIds.length ? sourceIds : Object.keys(FALLBACK_GYMS), catalog);
  publicGymsCache = { at: Date.now(), gyms };
  return gyms;
}
