import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };

const server = http.createServer(async (request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = normalize(urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, ""));
  if (relative.startsWith("..")) { response.writeHead(403).end("Forbidden"); return; }
  try {
    const file = await readFile(join(root, relative));
    response.writeHead(200, { "Content-Type": types[extname(relative)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(file);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => console.log(`Duendes en la Selva: http://127.0.0.1:${port}`));
