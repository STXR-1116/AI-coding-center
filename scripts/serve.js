import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = process.argv[2] || '.';
const port = Number(process.argv[3] || process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

createServer((req, res) => {
  const safePath = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^\.\.(\/|\\|$)/, '');
  let file = join(root, safePath === '/' ? 'index.html' : safePath);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`Serving ${root} at http://localhost:${port}`));
