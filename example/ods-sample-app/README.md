# Offline Data Sync Sample App

A React-based sample application demonstrating the features of the offline-data-sync library. This app implements a todo list with offline capabilities, conflict resolution, and real-time sync status.

## Features

- **Todo Management**

  - Create, read, update, delete todos
  - Mark todos as complete/incomplete
  - Real-time UI updates
  - Offline support

- **Sync Status**

  - Visual sync indicators
  - Conflict resolution UI
  - Network status monitoring
  - Pending changes counter

- **Offline Support**
  - Work without internet
  - Automatic background sync
  - Conflict detection
  - Data persistence

## Setup

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Build for production
npm run build
```

## Running with Test Server

1. Start the test server:

```bash
cd ../test-server
npm install
npm run dev
```

2. Start the sample app:

```bash
npm run dev
```

The app will run at `http://localhost:5173` and connect to the test server at `http://localhost:3001`.

## Testing Features

### 1. Basic Operations

- Add new todos
- Mark todos as complete
- Edit todo titles
- Delete todos

### 2. Offline Mode

1. Start the app and test server
2. Add some todos
3. Stop the test server (simulates offline)
4. Make changes in the app
5. Restart the server
6. Watch changes sync automatically

### 3. Conflict Resolution

1. Create a todo
2. Use the test server's force-conflict endpoint
3. Try to update the todo
4. Use the conflict resolution UI to resolve

## Project Structure

```
src/
├── adapters/
│   └── TodoApiAdapter.ts    # API adapter implementation
├── components/
│   ├── TodoList.tsx         # Main todo list component
│   ├── TodoItem.tsx         # Individual todo item
│   └── ConflictModal.tsx    # Conflict resolution UI
├── App.tsx                  # Main application
└── main.tsx                # Entry point
```

## Implementation Details

### API Adapter

```typescript
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

  // ... other methods
}
```

### SyncManager Setup

```typescript
const syncManager = new SyncManager({
  storeName: "todos",
  apiAdapter: new TodoApiAdapter("http://localhost:3001/api/todos"),
  conflictResolution: "manual",
});
```

### Sync Status Monitoring

```typescript
syncManager.onSyncStatusChange((status) => {
  setIsSyncing(status.pendingCount > 0);
  setHasConflicts(status.conflictCount > 0);
});
```

## UI Components

### Todo List

- Displays all todos
- Handles offline updates
- Shows sync status
- Supports batch operations

### Conflict Resolution

- Shows server vs client changes
- Provides resolution options
- Preserves data integrity
- Real-time updates

## Error Handling

- Network errors
- Conflict detection
- Version mismatches
- Data validation
- Retry mechanisms

## Performance

- Optimized re-renders
- Efficient data storage
- Background sync
- Batch processing
- Minimal UI updates
