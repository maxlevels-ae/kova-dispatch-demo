export async function readSettingsJSON(request, limit = 24000) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw Object.assign(new Error("Expected JSON"), { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("Body required"), { status: 400 });
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw Object.assign(new Error("Payload too large"), { status: 413 });
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}
