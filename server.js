cp ~/Downloads/server.js server.js
git add server.js
git commit -m "perf(scales): elimina loop N*M*K de queries no auto-generate, usa 3 queries + processamento em memória"
git push
