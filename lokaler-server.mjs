// ═══ Lokaler Vorschau-Server — bildet das Ziel-Layout von amzsellerhub.de ab ═══
// Solange die DENIC-Delegation hängt: Website + App lokal im echten Layout ansehen.
//   /        → website/            (Marketing-Seiten)
//   /app/    → Repo-Root           (die App: index.html + css/ + js/)
// Start:  node lokaler-server.mjs   (oder ./start-lokal.sh)  →  http://localhost:5173
// Die App spricht ganz normal mit dem Railway-Backend (Cloud-Login + Sync funktionieren;
// localStorage hängt an localhost:5173 — nach dem Login zieht der Sync deine Cloud-Daten).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = parseInt(process.env.PORT || '5173', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url || '/').split('?')[0]);

    // /app → /app/ (sonst brechen relative css/js-Pfade der App)
    if (path === '/app') { res.writeHead(301, { Location: '/app/' }); return res.end(); }

    // Mapping: /app/* → Repo-Root (App) · alles andere → website/
    let file;
    if (path.startsWith('/app/')) {
      const rest = path.slice(5) || 'index.html';
      file = join(ROOT, rest === '' ? 'index.html' : rest);
    } else {
      file = join(ROOT, 'website', path === '/' ? 'index.html' : path);
      if (path.endsWith('/')) file = join(ROOT, 'website', path, 'index.html');
    }

    // Pfad-Traversal verhindern (nur Dateien unterhalb des Projekts)
    if (!normalize(file).startsWith(ROOT)) { res.writeHead(403); return res.end('Verboten'); }

    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p>Nicht gefunden. <a href="/">Zur Startseite</a> · <a href="/app/">Zur App</a></p>');
  }
}).listen(PORT, () => {
  console.log(`✅ SellerHub-Vorschau läuft:`);
  console.log(`   Website:  http://localhost:${PORT}/`);
  console.log(`   App:      http://localhost:${PORT}/app/`);
  console.log(`   Beenden:  Ctrl+C`);
});
