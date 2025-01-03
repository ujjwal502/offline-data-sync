import express from "express";
import cors from "cors";
import morgan from "morgan";

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// In-memory storage
const db = new Map();
const versionMap = new Map();

// Utility to generate ETag
const generateETag = (id) => {
  const version = versionMap.get(id) || 1;
  return `"${version}"`;
};

// Middleware to check for conflicts
const checkConflict = (req, res, next) => {
  const id = req.params.id;
  const ifMatch = req.headers["if-match"];

  if (!ifMatch || ifMatch === "*") {
    return next();
  }

  const currentETag = generateETag(id);
  if (ifMatch !== currentETag) {
    const record = db.get(id);
    if (!record) {
      return next();
    }
    return res.status(409).json({
      error: "Conflict",
      serverVersion: record,
      version: versionMap.get(id),
      lastModified: record.lastModified,
    });
  }
  next();
};

// Create
app.post("/api/todos/:id", checkConflict, (req, res) => {
  const { id } = req.params;
  const data = req.body;

  // Increment version or start at 1
  const currentVersion = versionMap.get(id) || 0;
  const newVersion = currentVersion + 1;
  versionMap.set(id, newVersion);

  const record = {
    ...data,
    lastModified: new Date().toISOString(),
  };
  db.set(id, record);

  res.setHeader("ETag", `"${newVersion}"`);
  res.status(201).json(record);
});

// Read
app.get("/api/todos/:id", (req, res) => {
  const { id } = req.params;
  const record = db.get(id);

  if (!record) {
    return res.status(404).json({ error: "Not found" });
  }

  const version = versionMap.get(id);
  res.setHeader("ETag", `"${version}"`);
  res.json({ ...record, version });
});

// Update
app.put("/api/todos/:id", checkConflict, (req, res) => {
  const { id } = req.params;
  const data = req.body;

  if (!db.has(id)) {
    return res.status(404).json({ error: "Not found" });
  }

  // Increment version
  const currentVersion = versionMap.get(id);
  const newVersion = currentVersion + 1;
  versionMap.set(id, newVersion);

  const record = {
    ...data,
    lastModified: new Date().toISOString(),
  };
  db.set(id, record);

  res.setHeader("ETag", `"${newVersion}"`);
  res.json(record);
});

// Delete
app.delete("/api/todos/:id", checkConflict, (req, res) => {
  const { id } = req.params;

  if (!db.has(id)) {
    return res.status(404).json({ error: "Not found" });
  }

  db.delete(id);
  versionMap.delete(id);

  res.status(204).send();
});

// List all
app.get("/api/todos", (req, res) => {
  const records = Array.from(db.entries()).map(([id, data]) => ({
    ...data,
    id,
    version: versionMap.get(id),
  }));
  res.json(records);
});

// Utility endpoints for testing

// Force conflict on next request
app.post("/api/todos/:id/force-conflict", (req, res) => {
  const { id } = req.params;
  if (db.has(id)) {
    const version = (versionMap.get(id) || 0) + 1;
    versionMap.set(id, version);
    const record = {
      ...db.get(id),
      lastModified: Date.now(),
      serverModification: true,
    };
    db.set(id, record);
    res.json({
      message: "Conflict forced for next request",
      newVersion: version,
    });
  } else {
    res.status(404).json({ error: "Record not found" });
  }
});

// Clear database
app.post("/api/reset", (req, res) => {
  db.clear();
  versionMap.clear();
  res.json({ message: "Database reset" });
});

// Start server
app.listen(port, () => {
  console.log(`Test server running at http://localhost:${port}`);
});
