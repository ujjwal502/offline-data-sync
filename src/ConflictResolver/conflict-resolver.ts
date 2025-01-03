import { type SyncRecord, type SyncConfig } from "../common.types.js";

export class ConflictResolver {
  constructor(private config: SyncConfig) {}

  async resolve(record: SyncRecord, serverData: any): Promise<SyncRecord> {
    switch (this.config.conflictResolution) {
      case "client-wins":
        return this.clientWins(record);
      case "server-wins":
        return this.serverWins(record, serverData);
      case "last-write-wins":
        return this.lastWriteWins(record, serverData);
      case "merge":
        return this.merge(record, serverData);
      case "manual":
        return this.markForManualResolution(record, serverData);
      default:
        return this.serverWins(record, serverData);
    }
  }

  private async clientWins(record: SyncRecord): Promise<SyncRecord> {
    return {
      ...record,
      version: (record.version || 0) + 1,
      syncStatus: "pending",
    };
  }

  private async serverWins(
    record: SyncRecord,
    serverData: any
  ): Promise<SyncRecord> {
    return {
      ...record,
      data: serverData.serverVersion || serverData,
      version: serverData.version || (record.version || 0) + 1,
      lastModified: serverData.lastModified || Date.now(),
      syncStatus: "synced",
      serverData: undefined,
      conflictDetails: undefined,
    };
  }

  private async lastWriteWins(
    record: SyncRecord,
    serverData: any
  ): Promise<SyncRecord> {
    const serverLastModified = serverData.lastModified || 0;
    return serverLastModified > record.lastModified
      ? await this.serverWins(record, serverData)
      : await this.clientWins(record);
  }

  private async merge(
    record: SyncRecord,
    serverData: any
  ): Promise<SyncRecord> {
    if (!this.config.mergeStrategy) {
      throw new Error("Merge strategy is not provided");
    }

    const mergedData = this.config.mergeStrategy(record.data, serverData);
    return {
      ...record,
      data: mergedData,
      version: (record.version || 0) + 1,
      syncStatus: "synced",
      serverData: undefined,
    };
  }

  private async markForManualResolution(
    record: SyncRecord,
    serverData: any
  ): Promise<SyncRecord> {
    return {
      ...record,
      syncStatus: "conflict",
      serverData,
      conflictDetails: {
        clientVersion: record.version || 0,
        serverVersion: serverData.version || 0,
        serverLastModified: serverData.lastModified,
      },
    };
  }
}
