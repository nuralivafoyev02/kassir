function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function resolveFallbackUrl(requestUrl, backendOrigin) {
  const url = new URL(requestUrl);
  const origin = String(backendOrigin || "").trim().replace(/\/+$/, "");
  if (!origin) return "";
  return `${origin}${url.pathname}${url.search}`;
}

export async function onRequest(context) {
  if (context.env?.BACKEND?.fetch) {
    return context.env.BACKEND.fetch(context.request);
  }

  const fallbackUrl = resolveFallbackUrl(
    context.request.url,
    context.env?.PUBLIC_API_BASE_URL
  );

  if (!fallbackUrl) {
    return json(
      {
        ok: false,
        error: "BACKEND service binding yoki PUBLIC_API_BASE_URL topilmadi",
      },
      500
    );
  }

  return fetch(new Request(fallbackUrl, context.request));
}
