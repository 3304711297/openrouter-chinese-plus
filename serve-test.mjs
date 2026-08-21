// 本地测试服务:带 CORS 头返回构建产物,供浏览器实测注入用
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const script = readFileSync(join(root, 'openrouter-chinese-plus.user.js'), 'utf8');

createServer((req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(script);
}).listen(8931, () => console.log('serving on http://127.0.0.1:8931/script.js'));
