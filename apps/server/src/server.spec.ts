import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Controller, Get, Module, Req } from '@nestjs/common';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerEffectRuntime } from './app/platform/effect-runtime/server-effect-runtime.service';
import {
  getRequestIdentity,
  type RequestWithIdentity,
} from './app/platform/authentication/request-identity';
import { ServerModule } from './app/server.module';
import { createServer } from './create-server';

@Controller('test/protected')
class ProtectedTestController {
  @Get()
  getIdentity(@Req() request: RequestWithIdentity): unknown {
    return getRequestIdentity(request);
  }
}

@Module({ imports: [ServerModule], controllers: [ProtectedTestController] })
class ProtectedTestServerModule {}

describe('Omoikane server runtime', () => {
  let app: NestFastifyApplication | undefined;

  beforeEach(() => {
    vi.stubEnv('OMOIKANE_ENV', 'test');
    vi.stubEnv('OMOIKANE_SERVER_VERSION', '0.1.0-test');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'server-test-secret');
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
  });

  it('reports dependency-free process liveness', async () => {
    app = await createServer();

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'omoikane-server',
      version: '0.1.0-test',
    });
  });

  it('propagates correlation metadata and emits one structured safe request log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    app = await createServer();

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: {
        'x-request-id': 'browser-health-1',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
    });

    expect(response.headers['x-request-id']).toBe('browser-health-1');
    expect(response.headers['traceparent']).toContain(
      '4bf92f3577b34da6a3ce929d0e0e4736'
    );
    const record = log.mock.calls
      .map(([value]) => String(value))
      .filter((value) => value.startsWith('{'))
      .map((value) => JSON.parse(value) as Record<string, unknown>)
      .find((value) => value['request.id'] === 'browser-health-1');
    expect(record).toMatchObject({
      'service.name': 'omoikane-server',
      'deployment.environment': 'test',
      'request.id': 'browser-health-1',
      'trace.id': '4bf92f3577b34da6a3ce929d0e0e4736',
      'http.request.method': 'GET',
      'http.route': '/health/live',
      'http.response.status_code': 200,
    });
  });

  it('publishes the liveness contract in OpenAPI', async () => {
    app = await createServer();

    const response = await app.inject({
      method: 'GET',
      url: '/openapi.json',
    });
    const document = response.json<{
      readonly info: { readonly title: string };
      readonly paths: Readonly<Record<string, unknown>>;
      readonly components: {
        readonly schemas: Readonly<Record<string, unknown>>;
      };
    }>();

    expect(response.statusCode).toBe(200);
    expect(document.info.title).toBe('Omoikane Server API');
    expect(document.paths).toHaveProperty('/health/live');
    expect(document.paths).toHaveProperty(
      '/api/v1/workspaces/{workspaceId}/analysis-runs'
    );
    expect(document.paths).toHaveProperty(
      '/api/v1/workspaces/{workspaceId}/analysis-runs/{analysisRunId}/candidates/{candidateId}/review'
    );
    expect(document.components.schemas).toHaveProperty(
      'WorkspaceMessageInventoryResultResponse'
    );
    expect(document.components.schemas).toHaveProperty(
      'DecisionForensicsResultResponse'
    );
    expect(document.components.schemas).toHaveProperty(
      'AnalysisDecisionReviewResponse'
    );
    expect(document.components.schemas['AnalysisRunResponse']).toMatchObject({
      properties: {
        result: {
          oneOf: [
            {
              $ref: '#/components/schemas/WorkspaceMessageInventoryResultResponse',
            },
            { $ref: '#/components/schemas/DecisionForensicsResultResponse' },
          ],
        },
      },
    });
  });

  it('initializes one Effect runtime and disposes it with Nest', async () => {
    app = await createServer();
    const runtime = app.get(ServerEffectRuntime);
    const dispose = vi.spyOn(runtime, 'dispose');

    await expect(runtime.runPromise(Effect.succeed('ready'))).resolves.toBe(
      'ready'
    );

    await app.close();
    app = undefined;

    expect(dispose).toHaveBeenCalledOnce();
  });

  it.each([
    undefined,
    '',
    'Basic credentials',
    'Bearer',
    'Bearer token with-spaces',
  ])(
    'rejects a missing or malformed bearer header uniformly: %j',
    async (authorization) => {
      app = await createServer(ProtectedTestServerModule);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/test/protected',
        ...(authorization === undefined ? {} : { headers: { authorization } }),
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.headers['content-type']).toContain(
        'application/problem+json'
      );
      expect(response.json()).toMatchObject({
        type: 'https://omoikane.dev/problems/authentication-required',
        status: 401,
        code: 'authentication_required',
        instance: '/api/v1/test/protected',
        requestId: expect.any(String),
      });
      expect(response.headers['x-request-id']).toBe(
        response.json<{ readonly requestId: string }>().requestId
      );
    }
  );
});
