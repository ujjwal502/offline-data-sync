import { DBSchema } from "idb";
import { SyncRecord } from "../common.types";

export interface ApiAdapter {
  create(record: SyncRecord): Promise<Response>;
  update(record: SyncRecord): Promise<Response>;
  delete(record: SyncRecord): Promise<Response>;
  handleResponse(response: Response): Promise<unknown>;
}

export interface SyncDB extends DBSchema {
  [storeName: string]: {
    key: string;
    value: SyncRecord;
    indexes: {
      syncStatus: string;
      lastModified: number;
    };
  };
}
