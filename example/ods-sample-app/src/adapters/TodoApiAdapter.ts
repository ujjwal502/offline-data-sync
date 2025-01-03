import { ApiAdapter, SyncRecord } from "offline-data-sync";

export class TodoApiAdapter implements ApiAdapter {
  private isInitialized = false;
  private readonly apiUrl: string;

  constructor(private baseUrl: string) {
    // Remove trailing slash if present
    this.apiUrl = baseUrl.replace(/\/$/, "");
    this.initialize();
  }

  private async initialize() {
    try {
      // Test connection to server
      const response = await fetch(this.apiUrl);
      if (!response.ok) {
        throw new Error("Failed to connect to server");
      }
      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize TodoApiAdapter:", error);
    }
  }

  private async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  async create(record: SyncRecord): Promise<Response> {
    await this.ensureInitialized();

    const recordData = {
      id: record.id,
      title: record.data.title,
      completed: record.data.completed,
      userId: record.data.userId,
      lastModified: record.lastModified,
      version: record.version || 1,
    };

    return fetch(`${this.apiUrl}/${record.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "If-Match": record.version?.toString() || "*",
      },
      body: JSON.stringify(recordData),
    });
  }

  async update(record: SyncRecord): Promise<Response> {
    await this.ensureInitialized();

    // Skip API call if we're accepting client version in conflict resolution
    if (record.syncStatus === "synced" && record.serverData) {
      console.log("Skipping API call for client-accepted conflict resolution");
      return new Response(null, { status: 200 });
    }

    const id = record.serverId || record.id;
    const recordData = {
      id: record.id,
      title: record.data.title,
      completed: record.data.completed,
      userId: record.data.userId,
      lastModified: record.lastModified,
      version: record.version,
      syncStatus: record.syncStatus || "synced",
    };

    // For conflict resolution, use the server's version + 1
    if (record.serverData) {
      recordData.version = (record.serverData.version || 0) + 1;
    }

    return fetch(`${this.apiUrl}/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": recordData.version?.toString() || "*",
      },
      body: JSON.stringify(recordData),
    });
  }

  async delete(record: SyncRecord): Promise<Response> {
    await this.ensureInitialized();

    const id = record.serverId || record.id;

    // For deletion, we'll use "*" to force delete regardless of version
    // This is safe because deletion is a terminal operation
    return fetch(`${this.apiUrl}/${id}`, {
      method: "DELETE",
      headers: {
        "If-Match": "*",
      },
    });
  }

  async handleResponse(
    response: Response
    // record?: SyncRecord
  ): Promise<Record<string, unknown> | null> {
    if (!response.ok) {
      if (response.status === 409) {
        const conflictData = await response.json();

        return {
          ...conflictData.serverVersion,
          version: conflictData.version,
          lastModified: conflictData.lastModified,
        };
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (response.status === 204) {
      return null;
    }

    const data = await response.json();
    const etag = response.headers.get("ETag");
    const version = etag ? parseInt(etag.replace(/"/g, "")) : undefined;

    return {
      ...data,
      version: version || data.version,
      lastModified: data.lastModified || new Date().toISOString(),
    };
  }
}
