import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const guideOutputRoot = fileURLToPath(
  new URL('../../dist/user-guide/', import.meta.url)
);
const configuredPort = Number.parseInt(
  process.env.GUIDE_PORT?.trim() ?? '4173',
  10
);

if (
  !Number.isSafeInteger(configuredPort) ||
  configuredPort < 1 ||
  configuredPort > 65_535
) {
  throw new Error('GUIDE_PORT must be an integer between 1 and 65535.');
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webm', 'video/webm'],
]);

const sendText = (response, statusCode, message) => {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(message);
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? '127.0.0.1'}`
    );
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = decodedPath.replace(/^\/+/, '');
    let filePath = path.resolve(guideOutputRoot, relativePath);

    if (
      filePath !== path.resolve(guideOutputRoot) &&
      !filePath.startsWith(`${path.resolve(guideOutputRoot)}${path.sep}`)
    ) {
      sendText(response, 403, 'Forbidden');
      return;
    }

    let fileStats = await stat(filePath);
    if (fileStats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      fileStats = await stat(filePath);
    }

    const headers = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self'; media-src 'self'; style-src 'self'",
      'Content-Type':
        contentTypes.get(path.extname(filePath).toLowerCase()) ??
        'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    };
    const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/u);

    if (range !== undefined) {
      const requestedStart = range[1];
      const requestedEnd = range[2];
      const suffixLength =
        requestedStart.length === 0 ? Number.parseInt(requestedEnd, 10) : 0;
      const start =
        requestedStart.length > 0
          ? Number.parseInt(requestedStart, 10)
          : Math.max(0, fileStats.size - suffixLength);
      const end =
        requestedEnd.length > 0 && requestedStart.length > 0
          ? Number.parseInt(requestedEnd, 10)
          : fileStats.size - 1;

      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start > end ||
        start >= fileStats.size
      ) {
        response.writeHead(416, {
          ...headers,
          'Content-Range': `bytes */${fileStats.size}`,
        });
        response.end();
        return;
      }

      const boundedEnd = Math.min(end, fileStats.size - 1);
      response.writeHead(206, {
        ...headers,
        'Content-Length': boundedEnd - start + 1,
        'Content-Range': `bytes ${start}-${boundedEnd}/${fileStats.size}`,
      });
      createReadStream(filePath, { end: boundedEnd, start }).pipe(response);
      return;
    }

    response.writeHead(200, {
      ...headers,
      'Content-Length': fileStats.size,
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch (error) {
    const statusCode = error?.code === 'ENOENT' ? 404 : 400;
    sendText(
      response,
      statusCode,
      statusCode === 404 ? 'Not found' : 'Bad request'
    );
  }
});

server.listen(configuredPort, '127.0.0.1', () => {
  console.log(
    `[ok] Omoikane user guide available at http://127.0.0.1:${configuredPort}`
  );
});
