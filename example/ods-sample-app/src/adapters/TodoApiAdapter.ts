import { ApiAdapter, SyncRecord } from "offline-data-sync";

export class TodoApiAdapter implements ApiAdapter {
  constructor(private baseUrl: string) {}

  async create(record: SyncRecord): Promise<Response> {
    return fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        title: record.data.title,
        completed: record.data.completed,
        userId: record.data.userId,
      }),
    });
  }

  async update(record: SyncRecord): Promise<Response> {
    const id = record.serverId || record.data.id;
    console.log("Updating todo with server ID:", id, "Record:", record);

    return fetch(`${this.baseUrl}/${id}`, {
      method: "PATCH",
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        completed: record.data.completed,
      }),
    });
  }

  async delete(record: SyncRecord): Promise<Response> {
    const id = record.serverId || record.data.id;
    console.log("Deleting todo with server ID:", id, "Record:", record);

    return fetch(`${this.baseUrl}/${id}`, {
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
        const errorData = await response.json();
        return { error: errorData.message || "API error" };
      } catch {
        return { error: "Failed to parse error response" };
      }
    }

    try {
      if (response.status === 204) {
        return null;
      }
      const data = await response.json();
      console.log("Server response:", data);
      return {
        data: {
          ...data,
          serverId: data.id,
        },
      };
    } catch {
      return null;
    }
  }
}
