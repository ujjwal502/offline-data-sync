import { SyncRecord } from "../common.types";
import { ApiAdapter } from "./types";

export class DefaultApiAdapter implements ApiAdapter {
  constructor(private syncEndpoint: string) {}

  async create(record: SyncRecord): Promise<Response> {
    return fetch(`${this.syncEndpoint}/${record.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "If-Match": record.version?.toString() || "*",
      },
      body: JSON.stringify({
        data: record.data,
        lastModified: record.lastModified,
        version: record.version,
      }),
    });
  }

  async update(record: SyncRecord): Promise<Response> {
    return this.create(record);
  }

  async delete(record: SyncRecord): Promise<Response> {
    return fetch(`${this.syncEndpoint}/${record.id}`, {
      method: "DELETE",
      headers: {
        "If-Match": record.version?.toString() || "*",
      },
    });
  }

  async handleResponse(response: Response): Promise<unknown> {
    if (response.status === 409) {
      return response.json();
    }
    return null;
  }
}
