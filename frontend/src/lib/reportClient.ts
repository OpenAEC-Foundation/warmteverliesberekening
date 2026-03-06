/**
 * API-client voor OpenAEC Reports.
 *
 * Stuurt het OIDC Bearer token van de ingelogde gebruiker mee.
 * De Reports API (of reverse proxy ervoor) valideert de autorisatie.
 * Geen API keys in de frontend — per-user access control via SSO.
 */

import { authFetch } from "./backend";

const REPORTS_URL = "/api/report/generate";

/**
 * Genereer een PDF rapport via de OpenAEC Reports API (v2).
 *
 * @param reportData - BM Reports JSON conform report.schema.json
 * @returns PDF als Blob
 */
export async function generateReportDirect(
  reportData: Record<string, unknown>,
): Promise<Blob> {
  const res = await authFetch(REPORTS_URL, {
    method: "POST",
    body: JSON.stringify(reportData),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      (err as { detail?: string }).detail ?? `Rapport generatie mislukt (${res.status})`,
    );
  }

  return res.blob();
}
