const AI_FETCH_TIMEOUT_MS = 30_000;
const AI_FETCH_MAX_ATTEMPTS = 3;

export async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < AI_FETCH_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(tid);
      return response;
    } catch (error) {
      clearTimeout(tid);
      lastError =
        error instanceof Error && error.name === "AbortError"
          ? new Error(`AI request timed out after ${AI_FETCH_TIMEOUT_MS}ms.`)
          : error;
    }
  }

  throw lastError;
}
