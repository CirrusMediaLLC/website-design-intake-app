const STORE_NAME = "submission-queue";
const QUEUE_KEY = "rows";
const MAX_ROWS = 500;

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return json(204, {});

  try {
    if (event.httpMethod === "GET") {
      const rows = await readRows();
      return json(200, { rows: rows.sort(bySubmittedDesc) });
    }

    if (event.httpMethod === "POST") {
      const payload = parseJson(event.body);
      const incoming = Array.isArray(payload?.rows) ? payload.rows : [payload?.row || payload].filter(Boolean);
      if (!incoming.length) return json(400, { message: "Missing queue row." });

      const existing = await readRows();
      const merged = mergeRows(existing, incoming.map(normalizeRow).filter(Boolean));
      await writeRows(merged);
      return json(200, { message: "Queue saved.", rows: merged.sort(bySubmittedDesc) });
    }

    return json(405, { message: "Use GET or POST." });
  } catch (error) {
    return json(error.status || 500, { message: error.message || "Submission queue failed." });
  }
};

async function getQueueStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore(STORE_NAME);
}

async function readRows() {
  const store = await getQueueStore();
  const rows = await store.get(QUEUE_KEY, { type: "json" }).catch(() => []);
  return Array.isArray(rows) ? rows.filter(Boolean) : [];
}

async function writeRows(rows) {
  const store = await getQueueStore();
  await store.setJSON(QUEUE_KEY, rows.sort(bySubmittedAsc).slice(-MAX_ROWS));
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  const submittedAt = validDate(row.submittedAt) ? row.submittedAt : new Date().toISOString();
  return {
    id: String(row.id || `${submittedAt}-${Math.random().toString(16).slice(2)}`),
    submittedAt,
    brandName: clean(row.brandName) || "Untitled site",
    industry: clean(row.industry) || "Industry unset",
    owner: clean(row.owner) || "Designer / team",
    workspace: clean(row.workspace),
    project: clean(row.project),
    task: clean(row.task),
    taskGid: clean(row.taskGid),
    projectGid: clean(row.projectGid),
    taskUrl: clean(row.taskUrl),
    filename: clean(row.filename),
    message: clean(row.message) || "Details sent to Asana.",
    counts: {
      colors: Number(row.counts?.colors || 0),
      typography: Number(row.counts?.typography || 0),
      spacing: Number(row.counts?.spacing || 0),
      forms: Number(row.counts?.forms || 0)
    }
  };
}

function mergeRows(existing, incoming) {
  const byId = new Map();
  [...existing, ...incoming].forEach(row => {
    const normalized = normalizeRow(row);
    if (normalized) byId.set(normalized.id, normalized);
  });
  return Array.from(byId.values()).sort(bySubmittedAsc).slice(-MAX_ROWS);
}

function bySubmittedAsc(a, b) {
  return new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0);
}

function bySubmittedDesc(a, b) {
  return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0);
}

function clean(value) {
  return String(value || "").trim();
}

function validDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.valueOf());
}

function parseJson(body) {
  try { return JSON.parse(body || "{}"); }
  catch { return null; }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: statusCode === 204 ? "" : JSON.stringify(body)
  };
}
