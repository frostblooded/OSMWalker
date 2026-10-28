// Serves dist/ the way GitHub Pages does: gzip on the fly, Cache-Control max-age=600.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml", ".pbf": "application/x-protobuf", ".webmanifest": "application/manifest+json" };

export function serve(root, port) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(root, url);
    if (url.endsWith("/")) file = path.join(file, "index.html");
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    const body = zlib.gzipSync(fs.readFileSync(file), { level: 6 });
    res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", "Content-Encoding": "gzip", "Cache-Control": "max-age=600" });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
