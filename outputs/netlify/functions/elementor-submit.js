exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { message: "Use POST." });

  const payload = parseJson(event.body);
  if (!payload) return json(400, { message: "Invalid JSON payload." });

  const target = resolveElementorTarget(payload.target?.siteKey);
  const mode = payload.target?.mode || "dryRun";

  if (mode === "dryRun") {
    return json(200, {
      message: "Elementor mapping validated. Switch mode to applyGlobals or storePreset when the WordPress connector is configured.",
      target: { siteKey: payload.target?.siteKey || "", mode },
      mapped: mappingSummary(payload)
    });
  }

  if (!target.endpoint || !target.token) {
    return json(500, {
      message: "Elementor connector is not configured. Add ELEMENTOR_IMPORT_ENDPOINT and ELEMENTOR_IMPORT_TOKEN, or ELEMENTOR_SITES_JSON, in Netlify environment variables."
    });
  }

  try {
    const response = await fetch(target.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cirrus-Token": target.token,
        Authorization: `Bearer ${target.token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json(response.status, { message: data.message || `Elementor endpoint returned ${response.status}`, data });
    return json(200, { message: data.message || "Elementor payload sent.", data });
  } catch (error) {
    return json(502, { message: error.message || "Elementor connector request failed." });
  }
};

function resolveElementorTarget(siteKey = "") {
  const sites = parseJson(process.env.ELEMENTOR_SITES_JSON) || {};
  const site = siteKey ? sites[siteKey] || {} : {};
  return {
    endpoint: site.endpoint || process.env.ELEMENTOR_IMPORT_ENDPOINT || "",
    token: site.token || process.env.ELEMENTOR_IMPORT_TOKEN || ""
  };
}

function mappingSummary(payload) {
  return {
    systemColors: Object.keys(payload.kit?.systemColors || {}).length,
    customColors: payload.kit?.customColors?.length || 0,
    systemTypography: Object.keys(payload.kit?.systemTypography || {}).length,
    customTypography: payload.kit?.customTypography?.length || 0,
    spacingRules: payload.kit?.spacingTokens?.rules?.length || 0,
    formFields: payload.kit?.formTokens?.fields?.length || 0
  };
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
