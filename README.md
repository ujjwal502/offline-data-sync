# Offline-First Data Sync Library

A robust, TypeScript-based library for managing offline-first data synchronization in web applications. This library provides seamless data persistence and synchronization capabilities, ensuring your application works flawlessly regardless of network connectivity.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-blue.svg)

## 🚀 Features

- **Offline-First Architecture**

  - Seamless offline data persistence
  - Automatic synchronization when online
  - Background sync with configurable batching
  - Real-time connectivity monitoring
  - Immediate UI updates with offline changes

- **Advanced Conflict Resolution**

  - Multiple resolution strategies (client-wins, server-wins, last-write-wins)
  - Custom merge support
  - Manual conflict resolution with UI support
  - Version tracking and management
  - ETag-based conflict detection

- **Robust Error Handling**

  - Exponential backoff with jitter
  - Configurable retry mechanisms
  - Failure recovery strategies
  - Detailed error reporting
  - Graceful offline deletion handling

- **Flexible Configuration**
  - Customizable sync endpoints
  - Adjustable batch sizes
  - Configurable retry policies
  - Custom merge strategies
  - Custom API adapters

## 📋 Prerequisites

```bash
Node.js >= 14.0.0
npm >= 6.0.0
```

## 🔧 Installation

```bash
npm install offline-data-sync
```

## 🚦 Quick Start

```typescript
import { SyncManager } from "offline-data-sync";

// Create a custom API adapter
class TodoApiAdapter implements ApiAdapter {
  constructor(private baseUrl: string) {
    this.apiUrl = baseUrl.replace(/\/$/, "");
  }

  async create(record: SyncRecord): Promise<Response> {
    return fetch(`${this.apiUrl}/${record.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "If-Match": record.version?.toString() || "*",
      },
      body: JSON.stringify(record.data),
    });
  }

  // Implement other methods...
}

// Initialize SyncManager
const syncManager = new SyncManager({
  storeName: "todos",
  apiAdapter: new TodoApiAdapter("http://localhost:3001/api/todos"),
  conflictResolution: "server-wins",
  batchSize: 50,
});

// Create a todo
await syncManager.create({
  title: "New Todo",
  completed: false,
});

// Update a todo
await syncManager.update("todo-id", {
  title: "Updated Todo",
  completed: true,
});

// Delete a todo
await syncManager.delete("todo-id");

// Get processed records (with UI-ready format)
const records = await syncManager.getProcessedRecords();

// Monitor sync status
syncManager.onSyncStatusChange((status) => {
  console.log("Sync status:", status);
});
```

## ⚙️ Configuration

```typescript
interface SyncConfig {
  storeName: string;
  primaryKey?: string;
  syncEndpoint?: string;
  apiAdapter?: ApiAdapter;
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

interface ApiAdapter {
  create(record: SyncRecord): Promise<Response>;
  update(record: SyncRecord): Promise<Response>;
  delete(record: SyncRecord): Promise<Response>;
  handleResponse(response: Response): Promise<Record<string, unknown> | null>;
}
```

## 🔄 Conflict Resolution

### Server Wins (Default)

```typescript
const syncManager = new SyncManager({
  conflictResolution: "server-wins",
});
```

### Client Wins

```typescript
const syncManager = new SyncManager({
  conflictResolution: "client-wins",
});
```

### Manual Resolution

```typescript
const syncManager = new SyncManager({
  conflictResolution: "manual",
});

// Later, when conflict occurs:
await syncManager.resolveConflict(
  "record-id",
  "accept-server", // or "accept-client" or "custom"
  customData // optional, for custom resolution
);
```

## 🔌 Offline Behavior

- Records are immediately updated in IndexedDB
- UI reflects changes instantly
- Changes are queued for sync when online
- Deletions are handled gracefully
- Conflicts are detected and resolved on sync

## 🛠 Development

```bash
# Install dependencies
npm install

# Build library
npm run build

# Run example app
cd example/ods-sample-app
npm install
npm run dev

# Run test server
cd example/test-server
npm install
npm run dev
```

## 📚 API Reference

### SyncManager Methods

```typescript
class SyncManager {
  async create(data: any): Promise<void>;
  async update(id: string, data: any): Promise<void>;
  async delete(id: string): Promise<void>;
  async get(id: string): Promise<SyncRecord>;
  async getAll(): Promise<SyncRecord[]>;
  async getProcessedRecords(): Promise<any[]>;
  async resolveConflict(
    id: string,
    resolution: string,
    customData?: any
  ): Promise<void>;
  onSyncStatusChange(callback: (status: SyncStatus) => void): () => void;
}
```

## 🔒 Security

- Secure local data storage using IndexedDB
- Version control with ETags
- Data integrity validation
- Protected sync operations
- Conflict detection and resolution

## 📈 Performance

- Efficient batch processing
- Optimized IndexedDB operations
- Minimal memory footprint
- Smart conflict resolution
- Background sync operations
