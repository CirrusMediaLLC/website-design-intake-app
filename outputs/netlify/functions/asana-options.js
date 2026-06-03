const ASANA_API = "https://app.asana.com/api/1.0";

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return json(204, {});

  const token = process.env.ASANA_ACCESS_TOKEN;
  if (!token) return json(500, { message: "Asana is not connected. Add ASANA_ACCESS_TOKEN in Netlify environment variables." });

  const params = event.queryStringParameters || {};
  const type = params.type || "workspaces";

  try {
    if (type === "workspaces") {
      return json(200, await asana(token, "/workspaces?opt_fields=gid,name"));
    }
    if (type === "projects") {
      if (!params.workspace) return json(400, { message: "workspace is required." });
      return json(200, await asana(token, `/projects?workspace=${encodeURIComponent(params.workspace)}&archived=false&opt_fields=gid,name`));
    }
    if (type === "tasks") {
      if (!params.project) return json(400, { message: "project is required." });
      return json(200, await asana(token, `/tasks?project=${encodeURIComponent(params.project)}&completed_since=now&opt_fields=gid,name,completed`));
    }
    return json(400, { message: "Unknown options type." });
  } catch (error) {
    return json(error.status || 502, { message: error.message || "Asana lookup failed." });
  }
};

async function asana(token, path) {
  const response = await fetch(`${ASANA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.errors?.[0]?.message || `Asana returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: statusCode === 204 ? "" : JSON.stringify(body)
  };
}
