const AI_FETCH_TIMEOUT_MS = 30_000;
const AI_FETCH_MAX_ATTEMPTS = 3;

export async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? AI_FETCH_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) {
    throw new Error("AI_REQUEST_TIMEOUT_MS must be an integer between 1 and 600000.");
  }
  let lastError: unknown;

  for (let attempt = 0; attempt < AI_FETCH_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(tid);
      return response;
    } catch (error) {
      clearTimeout(tid);
      lastError =
        error instanceof Error && error.name === "AbortError"
          ? new Error(`AI request timed out after ${timeoutMs}ms.`)
          : error;
    }
  }

  throw lastError;
}
