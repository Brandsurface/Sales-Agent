import type { RegistryInfo } from "./types.js";

/**
 * Best-effort company registration lookup: fetches the company's own website, finds its
 * imprint/legal-notice page (Impressum in Germany, often just listed in the footer in Denmark/
 * Norway too), and extracts the official registration number from there. This generalizes across
 * countries instead of depending on a single country's registry API - it works for a Danish CVR
 * number, a German Handelsregister/HRB number, a Norwegian Org.nr, or a bare EU VAT ID, using only
 * the website URL the sales rep already has. Any failure returns null; this must never block the
 * research pipeline.
 */
export async function lookupCompanyRegistration(website: string | undefined): Promise<RegistryInfo | null> {
  if (!website) return null;

  let baseUrl: string;
  try {
    baseUrl = new URL(website.startsWith("http") ? website : `https://${website}`).toString();
  } catch {
    return null;
  }

  const homepageHtml = await fetchText(baseUrl);
  if (!homepageHtml) return null;

  let pageUrl = findImprintLink(homepageHtml, baseUrl);
  let pageHtml = pageUrl ? await fetchText(pageUrl) : null;

  if (!pageHtml) {
    for (const candidatePath of FALLBACK_PATHS) {
      try {
        const candidateUrl = new URL(candidatePath, baseUrl).toString();
        const html = await fetchText(candidateUrl);
        if (html) {
          pageUrl = candidateUrl;
          pageHtml = html;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  const text = stripHtml(pageHtml || homepageHtml);
  const info = extractRegistration(text);
  if (!info) return null;

  info.sourceUrl = pageUrl || baseUrl;
  return info;
}

const USER_AGENT =
  process.env.SCRAPER_USER_AGENT || "Mozilla/5.0 (compatible; ExemplarSalesAgent/1.0; +https://exemplar.dk)";

const IMPRINT_LINK_HINTS = [
  "impressum",
  "imprint",
  "legal notice",
  "legal-notice",
  "kontakt",
  "contact",
  "om os",
  "about us",
  "company info",
  "cvr",
  "juridisk",
];

const FALLBACK_PATHS = [
  "/impressum",
  "/imprint",
  "/legal",
  "/legal-notice",
  "/kontakt",
  "/contact",
  "/om-os",
  "/about",
  "/about-us",
];

async function fetchText(url: string, timeoutMs = 6000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType && !contentType.includes("html") && !contentType.includes("text")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function findImprintLink(html: string, baseUrl: string): string | null {
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html))) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").trim().toLowerCase();
    const hrefLower = href.toLowerCase();
    const isMatch = IMPRINT_LINK_HINTS.some(
      (hint) => text.includes(hint) || hrefLower.includes(hint.replace(/\s+/g, "-")) || hrefLower.includes(hint.replace(/\s+/g, ""))
    );
    if (isMatch) {
      try {
        return new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRegistration(text: string): RegistryInfo | null {
  const vatMatch = text.match(/\b([A-Z]{2}\d{8,12})\b/);
  const empty: Omit<RegistryInfo, "number" | "type"> = {
    authority: null,
    vatId: vatMatch ? vatMatch[1] : null,
    address: null,
    sourceUrl: null,
  };

  // Danish CVR
  let m = text.match(/CVR[-\s]?(?:nr\.?|number)?[:\s]*([\d\s]{8,12})/i);
  if (m) {
    return { number: m[1].replace(/\s/g, ""), type: "CVR (Denmark)", ...empty };
  }

  // German Handelsregister (HRA/HRB)
  m = text.match(/(HR[AB])\s*[-\s]?(\d+\s?[A-ZÄÖÜ]?)/i);
  if (m) {
    const courtMatch = text.match(/Registergericht[:\s]*([A-Za-zÄÖÜäöüß.\s]{2,40})/i);
    return {
      number: `${m[1].toUpperCase()} ${m[2]}`.trim(),
      type: "Handelsregister (Germany)",
      ...empty,
      authority: courtMatch ? courtMatch[1].trim() : null,
    };
  }

  // Norwegian/Swedish organisation number
  m = text.match(/Org(?:anisasjons)?\.?\s?nr\.?\s*[:\s]*([\d\s]{9,11})/i);
  if (m) {
    return { number: m[1].replace(/\s/g, ""), type: "Org.nr (Norway/Sweden)", ...empty };
  }

  // Fallback: a bare EU VAT ID is still a useful registration signal
  if (vatMatch) {
    return { number: vatMatch[1], type: "VAT ID", ...empty };
  }

  return null;
}
