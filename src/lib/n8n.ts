/**
 * n8n Webhook Client
 *
 * All backend logic is handled by n8n workflows.
 * This module provides typed wrappers for calling n8n webhook endpoints.
 */

const N8N_BASE_URL = process.env.N8N_WEBHOOK_BASE_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;

export class N8nError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public readonly body?: any
  ) {
    super(message);
    this.name = "N8nError";
  }
}

/**
 * Call an n8n webhook endpoint with a JSON payload.
 *
 * @param webhookId - The webhook UUID (e.g. "279f5964-5445-4b94-bae3-9a6d29f0dddb")
 * @param payload   - JSON body to send (must include event_type for n8n routing)
 * @returns Parsed JSON response from n8n
 */
export async function callN8nWebhook<TResponse = unknown>(
  webhookId: string,
  payload: Record<string, unknown>
): Promise<TResponse> {
  if (!N8N_BASE_URL) {
    throw new N8nError("N8N_WEBHOOK_BASE_URL environment variable is not set.");
  }
  if (!N8N_API_KEY) {
    throw new N8nError("N8N_API_KEY environment variable is not set.");
  }

  const url = `${N8N_BASE_URL.replace(/\/$/, "")}/${webhookId}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": N8N_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { /* ignore parse errors */ }
    throw new N8nError(
      `n8n webhook call failed: ${response.statusText}`,
      response.status,
      body
    );
  }

  return response.json() as Promise<TResponse>;
}

/**
 * Call an n8n webhook endpoint with a multipart/form-data payload (file upload).
 * Do NOT set Content-Type — fetch will auto-set the multipart boundary.
 *
 * @param webhookId - The webhook UUID
 * @param formData  - FormData including the file and any additional fields
 * @returns Parsed JSON response from n8n
 */
export async function callN8nWebhookMultipart<TResponse = unknown>(
  webhookId: string,
  formData: FormData
): Promise<TResponse> {
  if (!N8N_BASE_URL) {
    throw new N8nError("N8N_WEBHOOK_BASE_URL environment variable is not set.");
  }
  if (!N8N_API_KEY) {
    throw new N8nError("N8N_API_KEY environment variable is not set.");
  }

  const url = `${N8N_BASE_URL.replace(/\/$/, "")}/${webhookId}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": N8N_API_KEY,
      // Do NOT set Content-Type — let fetch auto-set multipart boundary
    },
    body: formData,
  });

  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { /* ignore parse errors */ }
    throw new N8nError(
      `n8n webhook call failed: ${response.statusText}`,
      response.status,
      body
    );
  }

  return response.json() as Promise<TResponse>;
}
