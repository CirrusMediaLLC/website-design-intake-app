exports.handler = async function handler() {
  const apiKey = process.env.GOOGLE_FONTS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fonts: [], source: "fallback", message: "GOOGLE_FONTS_API_KEY is not configured." })
    };
  }

  const endpoint = new URL("https://www.googleapis.com/webfonts/v1/webfonts");
  endpoint.searchParams.set("key", apiKey);
  endpoint.searchParams.set("sort", "popularity");

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fonts: [], error: "Google Fonts API request failed." })
      };
    }

    const data = await response.json();
    const fonts = (data.items || [])
      .map(item => item.family)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400"
      },
      body: JSON.stringify({ fonts, source: "google-fonts" })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fonts: [], error: "Unable to load Google Fonts." })
    };
  }
};
