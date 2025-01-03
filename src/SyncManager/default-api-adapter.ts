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
    return fetch(`${this.syncEndpoint}/${record.serverId || record.id}`, {
      method: "PUT",
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

  async delete(record: SyncRecord): Promise<Response> {
    return fetch(`${this.syncEndpoint}/${record.serverId || record.id}`, {
      method: "DELETE",
      headers: {
        "If-Match": record.version?.toString() || "*",
      },
    });
  }

  async handleResponse(response: Response): Promise<unknown> {
    if (response.status === 409) {
      const serverData = await response.json();
      return {
        data: serverData,
        version: response.headers.get("ETag") || serverData.version,
        lastModified: new Date(
          response.headers.get("Last-Modified") || serverData.lastModified
        ).getTime(),
      };
    }

    if (response.ok) {
      try {
        const data = await response.json();
        return {
          data,
          version: response.headers.get("ETag") || data.version,
          lastModified: new Date(
            response.headers.get("Last-Modified") || data.lastModified
          ).getTime(),
        };
      } catch {
        // If response is empty (e.g., for DELETE)
        return null;
      }
    }

    return null;
  }
}
