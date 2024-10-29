import { openDB, IDBPDatabase, DBSchema } from "idb";
import { SyncConfig, SyncRecord } from "../common.types.js";
import { ConflictResolver } from "../ConflictResolver/conflict-resolver.js";
import { RetryManager } from "../RetryManager/retry-manager.js";

interface SyncDB extends DBSchema {
  [key: string]: {
    key: string;
    value: SyncRecord;
    indexes: {
      syncStatus: string;
      lastModified: number;
    };
  };
}

export class SyncManager {
  private db: IDBPDatabase<SyncDB> | null = null;
  private config: SyncConfig;
  private isOnline: boolean = navigator.onLine;
  private conflictResolver: ConflictResolver;
  private retryManager: RetryManager;

  constructor(config: SyncConfig) {
    this.config = {
      primaryKey: "id",
      conflictResolution: "server-wins",
      batchSize: 50,
      maxRetries: 5,
      retryDelay: 1000,
      ...config,
    };

    this.conflictResolver = new ConflictResolver(this.config);
    this.retryManager = new RetryManager(this.config);

    this.initializeDB();
    this.setupEventListeners();
  }

  private async initializeDB(): Promise<void> {
    const config = this.config;
    this.db = await openDB<SyncDB>(this.config.storeName, 1, {
      upgrade(db) {
        const store = db.createObjectStore(config.storeName as never, {
          keyPath: config.primaryKey as string,
        });
        store.createIndex("syncStatus", "syncStatus");
        store.createIndex("lastModified", "lastModified");
      },
    });
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
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const record: SyncRecord = {
      id: crypto.randomUUID(),
      data,
      lastModified: Date.now(),
      syncStatus: this.isOnline ? "synced" : "pending",
      operation: "create",
    };

    await this.db.put(this.config.storeName as never, record);

    if (this.isOnline) {
      await this.syncRecord(record);
    }
  }

  async update(id: string, data: any): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    const record = await this.db.get(this.config.storeName as never, id);
    if (!record) {
      throw new Error("Record not found");
    }

    const updatedRecord: SyncRecord = {
      ...record,
      data,
      lastModified: Date.now(),
      syncStatus: this.isOnline ? "synced" : "pending",
      operation: "update",
    };

    await this.db.put(this.config.storeName as never, updatedRecord);

    if (this.isOnline) {
      await this.syncRecord(updatedRecord);
    }
  }

  async delete(id: string): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    const record = await this.db.get(this.config.storeName as never, id);
    if (!record) {
      throw new Error("Record not found");
    }
    record.operation = "delete";
    record.syncStatus = this.isOnline ? "synced" : "pending";
    record.lastModified = Date.now();

    await this.db.put(this.config.storeName as never, record);

    if (this.isOnline) {
      await this.syncRecord(record);
    }
  }

  async getAll(): Promise<SyncRecord[]> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    return await this.db.getAll(this.config.storeName as never);
  }

  async get(id: string): Promise<SyncRecord | undefined> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    return await this.db.get(this.config.storeName as never, id);
  }

  private async syncRecord(record: SyncRecord): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    try {
      const response = await fetch(`${this.config.syncEndpoint}/${record.id}`, {
        method: record.operation === "delete" ? "DELETE" : "POST",
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
      if (response.status === 409) {
        const serverData = await response.json();
        const resolvedRecord = await this.conflictResolver.resolve(
          record,
          serverData
        );
        await this.db.put(this.config.storeName as never, resolvedRecord);

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
        await this.db.put(this.config.storeName as never, record);
      }
    } catch (error) {
      record.retryCount = (record.retryCount || 0) + 1;

      if (this.retryManager.shouldRetry(record)) {
        await this.db.put(this.config.storeName as never, record);
        await this.retryManager.waitForNextRetry(record);
        await this.syncRecord(record);
      } else {
        record.syncStatus = "pending";
        await this.db.put(this.config.storeName as never, record);
      }
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

  async resolveConflict(
    id: string,
    resolution: "accept-client" | "accept-server" | "custom",
    customData?: any
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
          syncStatus: "pending",
          serverData: undefined,
          conflictDetails: undefined,
        };
        break;
      case "accept-server":
        resolvedRecord = {
          ...record,
          data: record.serverData,
          syncStatus: "synced",
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
    if (resolvedRecord.syncStatus === "pending") {
      await this.syncRecord(resolvedRecord);
    }
  }
}
