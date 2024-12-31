import { useEffect, useState } from "react";
import { SyncManager } from "offline-data-sync";
import { TodoApiAdapter } from "./adapters/TodoApiAdapter.ts";
import "./App.css";

interface Todo {
  id?: string;
  serverId?: number;
  title: string;
  completed: boolean;
  userId: number;
  lastModified?: number;
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

  useEffect(() => {
    initializeSyncManager();
  }, []);

  const initializeSyncManager = async () => {
    try {
      console.log("Initializing SyncManager...");
      const apiAdapter = new TodoApiAdapter(
        "https://jsonplaceholder.typicode.com/todos"
      );

      syncManager = new SyncManager({
        storeName: "todos",
        apiAdapter,
        conflictResolution: "manual",
        batchSize: 5,
        primaryKey: "id",
      });

      // Monitor sync status through records
      const updateSyncStatus = async () => {
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
      return () => clearInterval(statusInterval);
    } catch (err) {
      console.error("Failed to initialize SyncManager:", err);
      setError(
        err instanceof Error ? err.message : "Failed to initialize database"
      );
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("online", handleOnlineStatus);
      window.removeEventListener("offline", handleOnlineStatus);
    };
  }, []);

  const handleOnlineStatus = () => {
    const online = navigator.onLine;
    setIsOnline(online);
  };

  const loadTodos = async () => {
    try {
      console.log("Loading todos...");
      if (!syncManager) {
        throw new Error("SyncManager not initialized");
      }
      const records = await syncManager.getAll();
      console.log("Loaded records:", records);
      setTodos(
        records
          .filter((record) => record.operation !== "delete")
          .map((record) => ({
            ...record.data,
            id: record.id,
            serverId: record.data.serverId,
          }))
      );
    } catch (err) {
      console.error("Failed to load todos:", err);
      setError(err instanceof Error ? err.message : "Failed to load todos");
    }
  };

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newTodoTitle.trim()) return;
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
    try {
      if (!syncManager) {
        throw new Error("SyncManager not initialized");
      }

      // Get the record to ensure we have the correct ID
      const records = await syncManager.getAll();
      const record = records.find((r) => r.id === todo.id);

      if (!record) {
        throw new Error("Record not found");
      }

      const updatedTodo = {
        ...todo,
        completed: !todo.completed,
        lastModified: Date.now(),
      };

      await syncManager.update(record.id, updatedTodo);
      await loadTodos();
    } catch (err) {
      console.error("Failed to toggle todo:", err);
      setError(err instanceof Error ? err.message : "Failed to update todo");
    }
  };

  const deleteTodo = async (id: string) => {
    console.log("deleteTodo called with id:", id);

    try {
      console.log("deleteTodo called with id:", id);
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
      await syncManager.resolveConflict(id, resolution);
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
    <div className="app-container">
      <div className="status-bar">
        <div className="connection-status">
          {isOnline ? "🟢 Online" : "🔴 Offline"}
        </div>
        <div className="sync-status">
          Sync Status:{" "}
          <span className={`status-${syncStatus}`}>{syncStatus}</span>
        </div>
        <div className="pending-changes">Pending Changes: {pendingChanges}</div>
      </div>

      <h1>Offline-First Todo List</h1>

      <div className="action-buttons">
        <button onClick={addBatchTodos} className="batch-button">
          Add Batch Todos
        </button>
      </div>

      <form onSubmit={addTodo} className="add-todo-form">
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

      <ul className="todo-list">
        {todos.map((todo) => (
          <li
            key={todo.id}
            className={`todo-item ${
              syncStatus === "conflict" ? "has-conflict" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo)}
              className="todo-checkbox"
              disabled={syncStatus === "conflict"}
            />
            <span className={todo.completed ? "completed" : ""}>
              {todo.title}
            </span>
            {syncStatus === "conflict" && (
              <div className="conflict-actions">
                <div className="conflict-message">
                  ⚠️ Conflict detected! Choose version:
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
              disabled={syncStatus === "conflict"}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
