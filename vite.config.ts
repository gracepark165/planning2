import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 개발 서버에서도 /api/read(AI 읽기 서버 함수)가 동작하게 한다. /api/menu·/api/ingredients도 같은 함수 (vercel.json과 같게).
 * 배포(Vercel)에서는 Vercel이 api/read.ts를 직접 실행하므로 이 플러그인은 쓰이지 않는다.
 * 키는 .env.local에 둔다 (저장소에 올라가지 않음).
 */
function apiInDev(): Plugin {
  return {
    name: 'api-in-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // 주소가 정확히 /api/read·/api/menu·/api/ingredients인 POST만 (앱이 불러오는 /api/read.ts 소스 파일은 건드리지 않음)
        // 커뮤니티(/api/community)는 POST(글)·GET(사진) 둘 다. 저장소 키가 없으면 메모리 저장소 (껐다 켜면 사라짐)
        const path = req.url?.split('?')[0];
        const community = path === '/api/community';
        if (!community && (req.method !== 'POST' || !['/api/read', '/api/menu', '/api/ingredients'].includes(path ?? ''))) return next();
        try {
          const chunks: Buffer[] = [];
          if (req.method === 'POST') for await (const c of req) chunks.push(c as Buffer);
          type Fn = (r: Request) => Promise<Response>;
          const mod = (await server.ssrLoadModule(community ? '/api/community.ts' : '/api/read.ts')) as { POST: Fn; GET?: Fn };
          if (community) process.env.COMMUNITY_DEV_MEMORY ??= '1';
          const handler = req.method === 'GET' && mod.GET ? mod.GET : mod.POST;
          const response = await handler(
            new Request(`http://localhost${req.url}`, {
              method: req.method === 'GET' ? 'GET' : 'POST',
              headers: { 'content-type': 'application/json', 'x-forwarded-for': req.socket.remoteAddress ?? 'local' },
              ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
            }),
          );
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          server.config.logger.error(String(e));
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: 'ai-failed' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // .env.local의 키를 서버 함수가 읽을 수 있게 (이미 있는 값은 덮지 않음)
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), ''))) process.env[k] ??= v;
  return {
    plugins: [react(), apiInDev()],
    test: {
      include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    },
  };
});
