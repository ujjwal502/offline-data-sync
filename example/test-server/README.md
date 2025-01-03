# Test Server for Offline Data Sync Library

A test server implementation designed to demonstrate and test the offline-data-sync library's features, particularly focusing on conflict resolution and version control.

## Features

- **CRUD Operations**

  - Create, Read, Update, Delete for todos
  - Batch operations support
  - Proper error handling

- **Version Control**

  - ETag-based versioning
  - Version increment on updates
  - Conflict detection using If-Match headers

- **Conflict Handling**

  - Automatic conflict detection
  - Version mismatch handling
  - Server-side conflict response format
  - Force conflict endpoint for testing

- **Data Management**
  - In-memory data store
  - Version tracking
  - Last-Modified timestamps
  - Database reset capability

## Setup

```bash
# Install dependencies
npm install

# Start the server
npm start

# Start with auto-reload (development)
npm run dev
```

Server runs at `http://localhost:3001`

## API Endpoints

### Core Endpoints

```typescript
POST /api/todos/:id     // Create a todo
GET /api/todos/:id      // Get a todo
PUT /api/todos/:id      // Update a todo
DELETE /api/todos/:id   // Delete a todo
GET /api/todos          // List all todos
```

### Test Utilities

```typescript
POST /api/todos/:id/force-conflict  // Force a conflict for testing
POST /api/reset                     // Clear all data
```

## Headers

### Request Headers

- `If-Match`: Version check for updates
  - Use exact version: `"2"`
  - Skip check: `"*"`
- `Content-Type`: `application/json`

### Response Headers

- `ETag`: Current version (e.g., `"2"`)
- `Last-Modified`: Timestamp

## Testing Scenarios

### 1. Basic CRUD Operations

```typescript
// Create
POST /api/todos/123
{
  "title": "Test Todo",
  "completed": false
}

// Update
PUT /api/todos/123
{
  "title": "Updated Todo",
  "completed": true
}

// Delete
DELETE /api/todos/123
```

### 2. Conflict Testing

```typescript
// 1. Create initial todo
POST /api/todos/123
{
  "title": "Initial Todo"
}

// 2. Force conflict
POST /api/todos/123/force-conflict

// 3. Try update - will get 409 Conflict
PUT /api/todos/123
{
  "title": "Updated Todo"
}

// Response will include:
{
  "error": "Conflict",
  "serverVersion": { ... },
  "version": 2,
  "lastModified": "..."
}
```

### 3. Version Control

```typescript
// Create with initial version
POST /api/todos/123
Headers: { "If-Match": "*" }

// Update with version check
PUT /api/todos/123
Headers: { "If-Match": "1" }

// Delete with version check
DELETE /api/todos/123
Headers: { "If-Match": "2" }
```

## Error Responses

### 404 Not Found

```json
{
  "error": "Not found"
}
```

### 409 Conflict

```json
{
  "error": "Conflict",
  "serverVersion": {
    "id": "123",
    "title": "Server Version",
    "completed": false
  },
  "version": 2,
  "lastModified": "2024-01-03T12:00:00.000Z"
}
```

## Integration with Library

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

const syncManager = new SyncManager({
  apiAdapter: new TodoApiAdapter("http://localhost:3001/api/todos"),
});
```
