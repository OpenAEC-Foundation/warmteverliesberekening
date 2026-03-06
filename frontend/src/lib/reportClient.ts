/**
 * Directe API-client voor OpenAEC Reports.
 *
 * Roept de OpenAEC Reports API rechtstreeks aan (zonder backend proxy).
 * Vereist VITE_REPORTS_API_URL en VITE_REPORTS_API_KEY in .env.
 */

const REPORTS_API_URL =
  import.meta.env.VITE_REPORTS_API_URL ?? "https://reports.open-aec.com";
const REPORTS_API_KEY = import.meta.env.VITE_REPORTS_API_KEY ?? "";

/**
 * Genereer een PDF rapport via de OpenAEC Reports API (v2).
 *
 * @param reportData - BM Reports JSON conform report.schema.json
 * @returns PDF als Blob
 */
export async function generateReportDirect(
  reportData: Record<string, unknown>,
): Promise<Blob> {
  if (!REPORTS_API_KEY) {
    throw new Error(
      "VITE_REPORTS_API_KEY is niet geconfigureerd. " +
        "Voeg deze toe aan .env.development of .env.production.",
    );
  }

  const res = await fetch(`${REPORTS_API_URL}/api/generate/v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": REPORTS_API_KEY,
    },
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
