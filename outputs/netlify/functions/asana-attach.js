const ASANA_API = "https://app.asana.com/api/1.0";

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { message: "Use POST." });

  const token = process.env.ASANA_ACCESS_TOKEN;
  if (!token) return json(500, { message: "Asana is not connected. Add ASANA_ACCESS_TOKEN in Netlify environment variables." });

  const payload = parseJson(event.body);
  if (!payload) return json(400, { message: "Invalid JSON payload." });

  const taskGid = payload.target?.taskGid;
  if (!taskGid) return json(400, { message: "Choose an Asana task before exporting." });
  if (!payload.pdf?.base64) return json(400, { message: "Missing PDF attachment." });

  try {
    const uploaded = [];
    uploaded.push(await uploadAttachment(token, {
      parent: taskGid,
      filename: payload.pdf.filename || "design-guide.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(payload.pdf.base64, "base64")
    }));

    const comment = payload.comment || defaultComment(payload.summary);
    if (comment) {
      await asana(token, `/tasks/${taskGid}/stories`, {
        method: "POST",
        body: { data: { text: comment } }
      });
    }

    return json(200, {
      message: "Details sent to Asana.",
      taskGid,
      attachments: uploaded.map(item => item.data)
    });
  } catch (error) {
    return json(error.status || 502, { message: error.message || "Asana attachment export failed." });
  }
};

async function uploadAttachment(token, file) {
  const form = new FormData();
  form.append("parent", file.parent);
  form.append("file", new Blob([file.buffer], { type: file.mimeType }), file.filename);
  return asana(token, "/attachments", {
    method: "POST",
    body: form,
    isMultipart: true
  });
}

async function asana(token, path, options = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (!options.isMultipart) headers["Content-Type"] = "application/json";
  const response = await fetch(`${ASANA_API}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? (options.isMultipart ? options.body : JSON.stringify(options.body)) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.errors?.[0]?.message || `Asana returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function defaultComment(summary = {}) {
  const brand = summary.brandName || "this site";
  return `Design system PDF attached for ${brand}.`;
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
