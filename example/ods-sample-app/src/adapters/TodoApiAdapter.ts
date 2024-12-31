import { ApiAdapter, SyncRecord } from "offline-data-sync";

export class TodoApiAdapter implements ApiAdapter {
  constructor(private baseUrl: string) {}

  async create(record: SyncRecord): Promise<Response> {
    return fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(record.data),
    });
  }

  async update(record: SyncRecord): Promise<Response> {
    return fetch(`${this.baseUrl}/${record.data.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(record.data),
    });
  }

  async delete(record: SyncRecord): Promise<Response> {
    return fetch(`${this.baseUrl}/${record.data.id}`, {
      method: "DELETE",
    });
  }

  async handleResponse(
    response: Response
  ): Promise<Record<string, unknown> | null> {
    if (!response.ok) {
      if (response.status === 404) {
        return { error: "Resource not found" };
      }
      try {
        return await response.json();
      } catch {
        return { error: "Failed to parse error response" };
      }
    }
    if (response.status === 204) return null;
    return response.json();
  }
}
