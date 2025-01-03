import { openDB, IDBPDatabase, DBSchema } from "idb";
import { SyncConfig, SyncRecord } from "../common.types.js";
import { ConflictResolver } from "../ConflictResolver/conflict-resolver.js";
import { RetryManager } from "../RetryManager/retry-manager.js";
import { ApiAdapter, SyncDB } from "./types.js";
import { DefaultApiAdapter } from "./default-api-adapter.js";

export class SyncManager {
  private db: IDBPDatabase<SyncDB> | null = null;
  private config: SyncConfig;
  private isOnline: boolean = navigator.onLine;
  private retryManager: RetryManager;
  private conflictResolver: ConflictResolver;
  private initPromise: Promise<void>;
  private apiAdapter: ApiAdapter;

  constructor(config: SyncConfig) {
    this.config = {
      primaryKey: "id",
      conflictResolution: "server-wins",
      batchSize: 50,
      maxRetries: 5,
      retryDelay: 1000,
      ...config,
    };

    this.apiAdapter =
      config.apiAdapter ||
      (config.syncEndpoint
        ? new DefaultApiAdapter(config.syncEndpoint)
        : (() => {
            throw new Error(
              "Either apiAdapter or syncEndpoint must be provided"
            );
          })());
    this.retryManager = new RetryManager(this.config);
    this.conflictResolver = new ConflictResolver(this.config);

    this.initPromise = this.initializeDB();
    this.setupEventListeners();
  }

  private async initializeDB(): Promise<void> {
    try {
      const config = this.config;
      this.db = await openDB<SyncDB>(this.config.storeName, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(config.storeName as never)) {
            const store = db.createObjectStore(config.storeName as never, {
              keyPath: config.primaryKey as string,
            });
            store.createIndex("syncStatus", "syncStatus");
            store.createIndex("lastModified", "lastModified");
          }
        },
      });
    } catch (error) {
      console.error("Failed to initialize database:", error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
    if (!this.db) {
      throw new Error("Database not initialized");
    }
  }

  private setupEventListeners(): void {
    window.addEventListener("online", this.handleOnline.bind(this));
    window.addEventListener("offline", this.handleOffline.bind(this));
  }

  private async handleOnline(): Promise<void> {
    this.isOnline = true;
    await this.syncPendingChanges();
  }
  private handleOffline(): void {
    this.isOnline = false;
  }

  async create(data: any): Promise<void> {
    await this.ensureInitialized();

    const record: SyncRecord = {
      id: crypto.randomUUID(),
      data: { ...data },
      lastModified: Date.now(),
      syncStatus: this.isOnline ? "synced" : "pending",
      operation: "create",
      version: 1,
    };

    await this.db!.put(this.config.storeName as never, record);
    if (this.isOnline) {
      await this.syncRecord(record);
    }
  }

  async update(id: string, data: any): Promise<void> {
    await this.ensureInitialized();

    const record = await this.db!.get(this.config.storeName as never, id);
    if (!record) {
      throw new Error("Record not found");
    }

    const updatedRecord: SyncRecord = {
      ...record,
      data: {
        ...data,
        id: record.serverId || record.data.id,
      },
      lastModified: Date.now(),
      syncStatus: this.isOnline ? "synced" : "pending",
      operation: "update",
    };

    await this.db!.put(this.config.storeName as never, updatedRecord);

    if (this.isOnline) {
      await this.syncRecord(updatedRecord);
    }
  }

  async delete(id: string): Promise<void> {
    await this.ensureInitialized();

    const record = await this.db!.get(this.config.storeName as never, id);
    if (!record) {
      throw new Error("Record not found");
    }

    const deletionRecord: SyncRecord = {
      id: record.id,
      data: record.data,
      lastModified: Date.now(),
      syncStatus: "pending",
      operation: "delete",
      version: record.version,
      serverId: record.serverId,
      isDeleted: true,
    };

    await this.db!.put(this.config.storeName as never, deletionRecord);

    if (this.isOnline) {
      try {
        await this.syncRecord(deletionRecord);
      } catch (error) {
        console.error("Failed to delete from server:", error);
      }
    }
  }

  async getAll(): Promise<SyncRecord[]> {
    await this.ensureInitialized();
    return await this.db!.getAll(this.config.storeName as never);
  }

  async get(id: string): Promise<SyncRecord | undefined> {
    await this.ensureInitialized();
    return await this.db!.get(this.config.storeName as never, id);
  }

  private async syncRecord(record: SyncRecord): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    try {
      let response: Response;

      if (record.operation === "delete") {
        const existingRecord = await this.db.get(
          this.config.storeName as never,
          record.id
        );
        if (!existingRecord) {
          return;
        }
      }

      switch (record.operation) {
        case "create":
          response = await this.apiAdapter.create(record);
          break;
        case "update":
          response = await this.apiAdapter.update(record);
          break;
        case "delete":
          response = await this.apiAdapter.delete(record);
          break;
        default:
          throw new Error(`Unknown operation: ${record.operation}`);
      }

      const serverData = await this.apiAdapter.handleResponse(response);

      if (response.status === 409) {
        const resolvedRecord = await this.conflictResolver.resolve(
          record,
          serverData
        );

        await this.db.put(this.config.storeName as never, resolvedRecord);

        if (resolvedRecord.syncStatus === "conflict") {
          return;
        }

        if (resolvedRecord.syncStatus === "synced") {
          return;
        }

        if (resolvedRecord.syncStatus === "pending") {
          await this.syncRecord(resolvedRecord);
        }
        return;
      }

      if (!response.ok) {
        record.retryCount = (record.retryCount || 0) + 1;

        if (this.retryManager.shouldRetry(record)) {
          await this.db.put(this.config.storeName as never, record);
          await this.retryManager.waitForNextRetry(record);
          await this.syncRecord(record);
        } else {
          record.syncStatus = "pending";
          await this.db.put(this.config.storeName as never, record);
        }
        return;
      }

      if (record.operation === "delete") {
        await this.db.delete(this.config.storeName as never, record.id);
      } else {
        record.syncStatus = "synced";
        record.version = (record.version || 0) + 1;
        record.retryCount = 0;
        if (
          serverData &&
          typeof serverData === "object" &&
          serverData !== null &&
          "data" in serverData
        ) {
          const serverResponseData = serverData.data as Record<string, unknown>;
          record.serverId = serverResponseData.id as string | number;
          record.data = {
            ...record.data,
            ...serverResponseData,
          };
        }
        await this.db.put(this.config.storeName as never, record);
      }
    } catch (error) {
      console.error("Error in syncRecord:", error);
      throw error;
    }
  }

  private async syncPendingChanges(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const tx = this.db.transaction(this.config.storeName as never, "readonly");
    const index = tx.store.index("syncStatus");
    const pendingRecords = await index.getAll("pending");

    if (this.config.batchSize) {
      for (let i = 0; i < pendingRecords.length; i += this.config.batchSize) {
        const batch = pendingRecords.slice(i, i + this.config.batchSize);
        await Promise.all(batch.map((record) => this.syncRecord(record)));
      }
    }
  }

  async getProcessedRecords(): Promise<any[]> {
    await this.ensureInitialized();
    const records = await this.getAll();
    return records
      .filter((record) => !record.isDeleted)
      .map((record) => ({
        ...record.data,
        id: record.id,
        serverId: record.serverId || record.id,
        hasConflict: record.syncStatus === "conflict",
        serverVersion:
          record.syncStatus === "conflict"
            ? {
                ...record.serverData,
              }
            : undefined,
        version: record.version,
        lastModified: record.lastModified,
        syncStatus: record.syncStatus,
      }));
  }

  async getSyncStatus(): Promise<{
    status: "synced" | "pending" | "conflict";
    pendingCount: number;
    conflictCount: number;
  }> {
    await this.ensureInitialized();
    const records = await this.getAll();
    const pending = records.filter((r) => r.syncStatus === "pending");
    const conflicts = records.filter((r) => r.syncStatus === "conflict");

    return {
      status:
        conflicts.length > 0
          ? "conflict"
          : pending.length > 0
          ? "pending"
          : "synced",
      pendingCount: pending.length,
      conflictCount: conflicts.length,
    };
  }

  onSyncStatusChange(
    callback: (status: {
      status: "synced" | "pending" | "conflict";
      pendingCount: number;
      conflictCount: number;
    }) => void
  ): () => void {
    const interval = setInterval(async () => {
      const status = await this.getSyncStatus();
      callback(status);
    }, 2000);

    return () => clearInterval(interval);
  }

  async resolveConflict(
    id: string,
    resolution: "accept-client" | "accept-server" | "custom",
    customData?: any,
    options: { skipSync?: boolean } = {}
  ): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    const record = await this.db.get(this.config.storeName as never, id);
    if (!record || record.syncStatus !== "conflict") {
      throw new Error("No conflict found for this record");
    }

    let resolvedRecord: SyncRecord;
    switch (resolution) {
      case "accept-client":
        resolvedRecord = {
          ...record,
          syncStatus: "synced", // Always mark as synced for client acceptance
          serverData: undefined,
          conflictDetails: undefined,
        };
        break;
      case "accept-server":
        resolvedRecord = {
          ...record,
          data: record.serverData.serverVersion || record.serverData,
          version: record.serverData.version || (record.version || 0) + 1,
          lastModified: record.serverData.lastModified || Date.now(),
          syncStatus: "synced", // Always mark as synced for server acceptance
          serverData: undefined,
          conflictDetails: undefined,
        };
        break;
      case "custom":
        resolvedRecord = {
          ...record,
          data: customData,
          syncStatus: "pending",
          serverData: undefined,
          conflictDetails: undefined,
        };
        break;
      default:
        throw new Error("Invalid resolution type");
    }

    await this.db.put(this.config.storeName as never, resolvedRecord);

    if (
      resolvedRecord.syncStatus === "pending" &&
      !options.skipSync &&
      resolution !== "accept-server"
    ) {
      await this.syncRecord(resolvedRecord);
    }
  }
}
