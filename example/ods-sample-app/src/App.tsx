import { useEffect, useState } from "react";
import { SyncManager } from "offline-data-sync";
import { TodoApiAdapter } from "./adapters/TodoApiAdapter.ts";
import "./App.css";

interface ServerVersion {
  title: string;
  completed: boolean;
  userId: number;
  lastModified: number;
  version: number;
}

interface ServerData {
  data: ServerVersion;
}

interface Todo {
  id?: string;
  serverId?: string | number;
  title: string;
  completed: boolean;
  userId: number;
  lastModified?: number;
  version?: number;
  hasConflict?: boolean;
  serverVersion?: ServerVersion;
}

function isServerData(
  version: ServerVersion | ServerData
): version is ServerData {
  return "data" in version;
}

type SyncStatus = "synced" | "pending" | "conflict";

// Initialize SyncManager
let syncManager: SyncManager;

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [pendingChanges, setPendingChanges] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [conflictStrategy, setConflictStrategy] = useState<
    "manual" | "client-wins" | "server-wins" | "last-write-wins" | "merge"
  >("manual");

  // Add reinitialize function
  const reinitializeSyncManager = async (
    newStrategy: typeof conflictStrategy
  ) => {
    setConflictStrategy(newStrategy);
    await initializeSyncManager(newStrategy);
  };

  useEffect(() => {
    initializeSyncManager(conflictStrategy);
  }, []);

  const initializeSyncManager = async (strategy: typeof conflictStrategy) => {
    try {
      console.log("Initializing SyncManager with strategy:", strategy);
      // Define API URL
      const API_URL = "http://localhost:3001/api/todos";

      const apiAdapter = new TodoApiAdapter(API_URL);

      // Ensure any existing instance is cleaned up
      if (syncManager) {
        // Clean up existing listeners
        window.removeEventListener("online", handleOnlineStatus);
        window.removeEventListener("offline", handleOnlineStatus);
      }

      syncManager = new SyncManager({
        storeName: "todos",
        apiAdapter,
        conflictResolution: strategy,
        batchSize: 5,
        primaryKey: "id",
        // Add a merge strategy for testing
        mergeStrategy: (clientData, serverData) => ({
          ...serverData,
          ...clientData,
          title: `MERGED: ${clientData.title} || ${serverData.title}`,
          mergedAt: Date.now(),
        }),
      });

      // Wait for initialization to complete
      await new Promise((resolve) => setTimeout(resolve, 100)); // Give IndexedDB time to initialize
      await syncManager.getAll(); // This will ensure DB is initialized

      setIsInitialized(true);

      // Monitor sync status through records
      const updateSyncStatus = async () => {
        if (!isInitialized) return;

        try {
          const records = await syncManager.getAll();
          const hasPending = records.some(
            (record) => record.syncStatus === "pending"
          );
          const hasConflict = records.some(
            (record) => record.syncStatus === "conflict"
          );
          if (hasConflict) {
            setSyncStatus("conflict");
          } else if (hasPending) {
            setSyncStatus("pending");
          } else {
            setSyncStatus("synced");
          }
          setPendingChanges(
            records.filter((record) => record.syncStatus === "pending").length
          );
        } catch (err) {
          console.error("Error updating sync status:", err);
        }
      };

      // Initial status check
      await updateSyncStatus();

      // Set up periodic status check
      const statusInterval = setInterval(updateSyncStatus, 2000);

      console.log("SyncManager initialized successfully");

      await loadTodos();

      window.addEventListener("online", handleOnlineStatus);
      window.addEventListener("offline", handleOnlineStatus);

      setIsLoading(false);

      // Clean up interval on unmount
      return () => {
        clearInterval(statusInterval);
        window.removeEventListener("online", handleOnlineStatus);
        window.removeEventListener("offline", handleOnlineStatus);
      };
    } catch (err) {
      console.error("Failed to initialize SyncManager:", err);
      setError(
        err instanceof Error ? err.message : "Failed to initialize SyncManager"
      );
      setIsLoading(false);
    }
  };

  const handleOnlineStatus = () => {
    setIsOnline(navigator.onLine);
  };

  const loadTodos = async () => {
    try {
      // Use the new getProcessedRecords method
      const todoList = await syncManager.getProcessedRecords();

      setTodos(todoList.filter((todo) => todo.operation !== "delete"));
    } catch (err) {
      console.error("Failed to load todos:", err);
      setError(err instanceof Error ? err.message : "Failed to load todos");
    }
  };

  // Replace updateSyncStatus with the new onSyncStatusChange
  useEffect(() => {
    if (isInitialized && syncManager) {
      const unsubscribe = syncManager.onSyncStatusChange(
        ({ status, pendingCount }) => {
          setSyncStatus(status);
          setPendingChanges(pendingCount);
        }
      );
      return unsubscribe;
    }
  }, [isInitialized]);

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim() || !isInitialized) return;

    try {
      if (!syncManager) {
        throw new Error("SyncManager not initialized");
      }

      const todo: Todo = {
        title: newTodoTitle,
        completed: false,
        userId: 1,
        lastModified: Date.now(),
      };

      await syncManager.create(todo);
      setNewTodoTitle("");
      await loadTodos();
    } catch (err) {
      console.error("Failed to add todo:", err);
      setError(err instanceof Error ? err.message : "Failed to add todo");
    }
  };

  const toggleTodo = async (todo: Todo) => {
    if (!isInitialized) return;

    try {
      if (!syncManager || !todo.id) {
        throw new Error("Invalid operation");
      }

      const updatedTodo = {
        ...todo,
        completed: !todo.completed,
        lastModified: Date.now(),
      };

      await syncManager.update(todo.id, updatedTodo);
      await loadTodos();
    } catch (err) {
      console.error("Failed to toggle todo:", err);
      setError(err instanceof Error ? err.message : "Failed to toggle todo");
    }
  };

  const deleteTodo = async (id: string) => {
    if (!isInitialized) return;

    try {
      if (!syncManager) {
        throw new Error("SyncManager not initialized");
      }

      await syncManager.delete(id);
      await loadTodos();
    } catch (err) {
      console.error("Failed to delete todo:", err);
      setError(err instanceof Error ? err.message : "Failed to delete todo");
    }
  };

  const resolveConflict = async (
    id: string,
    resolution: "accept-client" | "accept-server"
  ) => {
    try {
      if (!syncManager) {
        throw new Error("SyncManager not initialized");
      }

      // Find the todo with conflict
      const todo = todos.find((t) => t.id === id);
      if (!todo || !todo.serverVersion) {
        throw new Error("Todo or server version not found");
      }

      const serverData = isServerData(todo.serverVersion)
        ? todo.serverVersion.data
        : todo.serverVersion;

      const resolvedTodo =
        resolution === "accept-server"
          ? {
              ...serverData,
              id: todo.id,
              serverId: todo.serverId,
              version: serverData.version,
              lastModified: serverData.lastModified,
            }
          : todo;

      await syncManager.resolveConflict(id, resolution, resolvedTodo);
      await loadTodos();
    } catch (err) {
      console.error("Failed to resolve conflict:", err);
      setError(
        err instanceof Error ? err.message : "Failed to resolve conflict"
      );
    }
  };

  const addBatchTodos = async () => {
    try {
      if (!syncManager) {
        throw new Error("SyncManager not initialized");
      }

      const batchTodos = Array.from({ length: 5 }, (_, i) => ({
        title: `Batch Todo ${i + 1}`,
        completed: false,
        userId: 1,
        lastModified: Date.now() + i,
      }));

      await Promise.all(batchTodos.map((todo) => syncManager.create(todo)));
      await loadTodos();
    } catch (err) {
      console.error("Failed to add batch todos:", err);
      setError(
        err instanceof Error ? err.message : "Failed to add batch todos"
      );
    }
  };

  const forceConflict = async (id: string) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/todos/${id}/force-conflict`,
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to force conflict");
      }
      const result = await response.json();
      console.log("Conflict forced:", result);
    } catch (err) {
      console.error("Failed to force conflict:", err);
      setError(err instanceof Error ? err.message : "Failed to force conflict");
    }
  };

  const resetServer = async () => {
    try {
      const response = await fetch("http://localhost:3001/api/reset", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to reset server");
      }
      await loadTodos();
    } catch (err) {
      console.error("Failed to reset server:", err);
      setError(err instanceof Error ? err.message : "Failed to reset server");
    }
  };

  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return (
      <div className="error">
        <p>Error: {error}</p>
        <button onClick={() => setError(null)} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>Todo App with Offline Sync</h1>
        <div className="status-bar">
          <span className={`status-${isOnline ? "online" : "offline"}`}>
            {isOnline ? "🟢 Online" : "🔴 Offline"}
          </span>
          <span className={`status-${syncStatus}`}>
            {syncStatus === "synced"
              ? "✓ Synced"
              : syncStatus === "pending"
              ? `⏳ Pending (${pendingChanges})`
              : "⚠️ Conflict"}
          </span>
        </div>
        <div className="strategy-selector">
          <label>Conflict Resolution Strategy: </label>
          <select
            value={conflictStrategy}
            onChange={(e) =>
              reinitializeSyncManager(e.target.value as typeof conflictStrategy)
            }
          >
            <option value="manual">Manual Resolution</option>
            <option value="client-wins">Client Wins</option>
            <option value="server-wins">Server Wins</option>
            <option value="last-write-wins">Last Write Wins</option>
            <option value="merge">Merge</option>
          </select>
          <div className="current-strategy">
            Current Strategy: <strong>{conflictStrategy}</strong>
          </div>
        </div>
      </header>

      <div className="controls">
        <form onSubmit={addTodo} className="add-todo">
          <input
            type="text"
            value={newTodoTitle}
            onChange={(e) => setNewTodoTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="todo-input"
          />
          <button type="submit" className="add-button">
            Add Todo
          </button>
        </form>

        <div className="test-controls">
          <button onClick={addBatchTodos} className="test-button">
            Add 5 Todos
          </button>
          <button onClick={resetServer} className="test-button danger">
            Reset Server
          </button>
        </div>
      </div>

      <ul className="todo-list">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className={`todo-item ${todo.hasConflict ? "has-conflict" : ""}`}
          >
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo)}
              className="todo-checkbox"
              disabled={todo.hasConflict}
            />
            <span className={todo.completed ? "completed" : ""}>
              {todo.title}
            </span>
            <div className="todo-actions">
              {todo.id && (
                <button
                  onClick={() => forceConflict(todo.id!)}
                  className="conflict-button"
                  title="Force a conflict for testing"
                >
                  🔄 Force Conflict
                </button>
              )}
              {todo.hasConflict && (
                <div className="conflict-actions">
                  <div className="conflict-message">
                    ⚠️ Conflict detected! Choose version:
                  </div>
                  <div className="conflict-details">
                    <div>
                      Local: {todo.title} (
                      {todo.completed ? "Done" : "Not Done"})
                    </div>
                    <div>
                      Server:
                      {todo.title}(
                      {todo.serverVersion
                        ? todo.serverVersion.completed
                          ? "Done"
                          : "Not Done"
                        : ""}
                      )
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      todo.id && resolveConflict(todo.id, "accept-client")
                    }
                    className="conflict-button client"
                  >
                    Keep Local Changes
                  </button>
                  <button
                    onClick={() =>
                      todo.id && resolveConflict(todo.id, "accept-server")
                    }
                    className="conflict-button server"
                  >
                    Use Server Version
                  </button>
                </div>
              )}
              <button
                onClick={() => todo.id && deleteTodo(todo.id)}
                className="delete-button"
                disabled={todo.hasConflict}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
