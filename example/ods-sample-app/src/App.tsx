import { useEffect, useState } from "react";
import { SyncManager } from "offline-data-sync";
import { TodoApiAdapter } from "./adapters/TodoApiAdapter.ts";
import "./App.css";

interface Todo {
  id?: string;
  title: string;
  completed: boolean;
  userId: number;
}

// Initialize SyncManager
let syncManager: SyncManager;

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        conflictResolution: "last-write-wins",
        batchSize: 10,
        primaryKey: "id",
      });
      console.log("SyncManager initialized successfully");

      await loadTodos();

      window.addEventListener("online", handleOnlineStatus);
      window.addEventListener("offline", handleOnlineStatus);

      setIsLoading(false);
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
    setIsOnline(navigator.onLine);
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
          .map((record) => record.data)
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
      };

      await syncManager.create(todo);
      setNewTodoTitle("");
      await loadTodos();
    } catch (err) {
      console.error("Failed to add todo:", err);
      setError(err instanceof Error ? err.message : "Failed to add todo");
    }
  };

  // const toggleTodo = async (todo: Todo) => {
  //   try {
  //     if (!syncManager) {
  //       throw new Error("SyncManager not initialized");
  //     }
  //     const updatedTodo = { ...todo, completed: !todo.completed };
  //     await syncManager.update(todo.id, updatedTodo);
  //     await loadTodos();
  //   } catch (err) {
  //     console.error("Failed to toggle todo:", err);
  //     setError(err instanceof Error ? err.message : "Failed to update todo");
  //   }
  // };

  const deleteTodo = async (id: string) => {
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
      <div className="connection-status">
        {isOnline ? "🟢 Online" : "🔴 Offline"}
      </div>

      <h1>Offline-First Todo List</h1>

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
          <li key={todo.id} className="todo-item">
            {/* <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo)}
              className="todo-checkbox"
            /> */}
            <span className={todo.completed ? "completed" : ""}>
              {todo.title}
            </span>
            <button
              onClick={() => todo.id && deleteTodo(todo.id)}
              className="delete-button"
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
