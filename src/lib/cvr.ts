import type { CvrInfo } from "./types.js";

/**
 * Best-effort lookup against cvrapi.dk (free, no key, 50 requests/day).
 * Returns null on any failure (not found, rate-limited, non-Danish company, network error) -
 * this enrichment is optional and must never block the research pipeline.
 */
export async function lookupCvr(companyName: string): Promise<CvrInfo | null> {
  const userAgent = process.env.CVRAPI_USER_AGENT || "Exemplar - Sales-Agent - sales@exemplar.dk";
  const url = `https://cvrapi.dk/api?search=${encodeURIComponent(companyName)}&country=dk`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    if (!data || data.error) return null;

    const address = [data.address, data.zipcode, data.city]
      .filter((v) => typeof v === "string" && v.length > 0)
      .join(", ");

    return {
      number: typeof data.vat === "string" || typeof data.vat === "number" ? String(data.vat) : null,
      industryText: typeof data.industrydesc === "string" ? data.industrydesc : null,
      employeesRange: typeof data.employees === "string" ? data.employees : null,
      founded: typeof data.startdate === "string" ? data.startdate : null,
      address: address.length > 0 ? address : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
