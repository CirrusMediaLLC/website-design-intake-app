const ASANA_API = "https://app.asana.com/api/1.0";

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { message: "Use POST." });

  const token = process.env.ASANA_ACCESS_TOKEN;
  if (!token) return json(500, { message: "Asana is not connected. Add ASANA_ACCESS_TOKEN in Netlify environment variables." });

  const payload = parseJson(event.body);
  if (!payload) return json(400, { message: "Invalid JSON payload." });

  const parentTaskGid = payload.target?.parentTaskGid;
  if (!parentTaskGid) return json(400, { message: "Select or paste an Asana parent task GID before submitting." });

  const taskName = payload.task?.name || "Design system intake";
  const notes = payload.task?.notes || "Design guide payload submitted.";
  const mode = payload.target?.mode || "subtask";
  const projectGid = payload.target?.projectGid || "";
  const customFields = payload.task?.customFields && typeof payload.task.customFields === "object"
    ? payload.task.customFields
    : {};

  try {
    if (mode === "comment") {
      const story = await asana(token, `/tasks/${parentTaskGid}/stories`, {
        method: "POST",
        body: { data: { text: notes } }
      });
      return json(200, { message: "Added Asana comment.", data: story.data });
    }

    const existing = await asana(token, `/tasks/${parentTaskGid}/subtasks?opt_fields=gid,name`);
    const match = (existing.data || []).find(task => String(task.name || "").trim().toLowerCase() === taskName.trim().toLowerCase());
    if (match) {
      const updated = await asana(token, `/tasks/${match.gid}`, {
        method: "PUT",
        body: { data: taskData({ name: taskName, notes, customFields }) }
      });
      if (projectGid) await addTaskToProject(token, match.gid, projectGid);
      return json(200, { message: "Updated existing Asana design-guide subtask.", data: updated.data });
    }

    const created = await asana(token, `/tasks/${parentTaskGid}/subtasks`, {
      method: "POST",
      body: { data: taskData({ name: taskName, notes, customFields }) }
    });
    if (projectGid) await addTaskToProject(token, created.data.gid, projectGid);
    return json(200, { message: "Created Asana design-guide subtask.", data: created.data });
  } catch (error) {
    return json(error.status || 502, { message: error.message || "Asana submission failed." });
  }
};

async function asana(token, path, options = {}) {
  const response = await fetch(`${ASANA_API}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.errors?.[0]?.message || `Asana returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function taskData({ name, notes, customFields }) {
  const data = { name, notes };
  if (customFields && Object.keys(customFields).length) data.custom_fields = customFields;
  return data;
}

async function addTaskToProject(token, taskGid, projectGid) {
  try {
    await asana(token, `/tasks/${taskGid}/addProject`, {
      method: "POST",
      body: { data: { project: projectGid } }
    });
  } catch (error) {
    if (error.status !== 400) throw error;
  }
}

function parseJson(body) {
  try { return JSON.parse(body || "{}"); }
  catch { return null; }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: statusCode === 204 ? "" : JSON.stringify(body)
  };
}
