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

- **Advanced Conflict Resolution**

  - Multiple resolution strategies
  - Custom merge support
  - Manual conflict resolution
  - Version tracking and management

- **Robust Error Handling**

  - Exponential backoff with jitter
  - Configurable retry mechanisms
  - Failure recovery strategies
  - Detailed error reporting

- **Flexible Configuration**
  - Customizable sync endpoints
  - Adjustable batch sizes
  - Configurable retry policies
  - Custom merge strategies

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

// Initialize the sync manager
const syncManager = new SyncManager({
  storeName: "myStore",
  syncEndpoint: "https://api.example.com/sync",
  conflictResolution: "last-write-wins",
  batchSize: 50,
});

// Create a record
await syncManager.create({
  title: "New Item",
  description: "Description",
});

// Update a record
await syncManager.update("recordId", {
  title: "Updated Title",
});

// Delete a record
await syncManager.delete("recordId");

// Get all records
const records = await syncManager.getAll();
```

## ⚙️ Configuration Options

```typescript
interface SyncConfig {
  storeName: string; // IndexedDB store name
  syncEndpoint: string; // Server endpoint for sync
  primaryKey?: string; // Primary key field (default: 'id')
  conflictResolution?: // Conflict resolution strategy
  "client-wins" | "server-wins" | "last-write-wins" | "merge" | "manual";
  batchSize?: number; // Batch size for sync operations
  maxRetries?: number; // Maximum retry attempts
  retryDelay?: number; // Base delay between retries (ms)
  mergeStrategy?: (clientData: any, serverData: any) => any;
}
```

## Conflict Resolution Strategies

### 1. Client Wins

```typescript
const syncManager = new SyncManager({
  conflictResolution: "client-wins",
});
```

### 2. Server Wins

```typescript
const syncManager = new SyncManager({
  conflictResolution: "server-wins",
});
```

### 3. Last Write Wins

```typescript
const syncManager = new SyncManager({
  conflictResolution: "last-write-wins",
});
```

### 4. Custom Merge

```typescript
const syncManager = new SyncManager({
  conflictResolution: "merge",
  mergeStrategy: (clientData, serverData) => {
    return {
      ...serverData,
      ...clientData,
      mergedAt: Date.now(),
    };
  },
});
```

### 5. Manual Resolution

```typescript
const syncManager = new SyncManager({
  conflictResolution: "manual",
});

// Resolve conflicts manually
await syncManager.resolveConflict(
  recordId,
  "accept-client" | "accept-server" | "custom",
  customData
);
```

## Use Cases

- **Field Service Applications**

  - Work offline in remote locations
  - Sync data when connection restored
  - Handle conflicting updates

- **Healthcare Applications**

  - Reliable patient data access
  - Secure offline storage
  - Conflict resolution for concurrent updates

- **Point of Sale Systems**

  - Operate during network outages
  - Queue transactions for sync
  - Maintain data consistency

- **Content Management Systems**
  - Offline content editing
  - Auto-save and sync
  - Collaborative editing support

## API Reference

### SyncManager

```typescript
class SyncManager {
  constructor(config: SyncConfig);

  async create(data: any): Promise<void>;
  async update(id: string, data: any): Promise<void>;
  async delete(id: string): Promise<void>;
  async get(id: string): Promise<SyncRecord>;
  async getAll(): Promise<SyncRecord[]>;
  async resolveConflict(
    id: string,
    resolution: "accept-client" | "accept-server" | "custom",
    customData?: any
  ): Promise<void>;
}
```

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test
```

## Performance Considerations

- Implements efficient batch processing
- Optimized IndexedDB operations
- Minimal memory footprint
- Network-aware sync strategies

## Security

- Secure local data storage
- Protected sync operations
- Version control
- Data integrity validation

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
