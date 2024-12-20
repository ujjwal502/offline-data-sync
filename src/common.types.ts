interface SyncConfig {
  storeName: string;
  primaryKey?: string;
  syncEndpoint: string;
  conflictResolution?:
    | "client-wins"
    | "server-wins"
    | "manual"
    | "last-write-wins"
    | "merge";
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  mergeStrategy?: (clientData: any, serverData: any) => any;
}

interface SyncRecord {
  id: string;
  data: any;
  lastModified: number;
  syncStatus: "synced" | "pending" | "conflict";
  operation: "create" | "update" | "delete";
  version?: number;
  retryCount?: number;
  serverData?: any;
  conflictDetails?: {
    clientVersion: number;
    serverVersion: number;
    serverLastModified: number;
  };
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
}

export { type SyncConfig, type SyncRecord, type RetryConfig };
