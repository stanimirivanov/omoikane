import { Controller, Get, Module, Req } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@omoikane/shared/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRequestIdentity,
  type RequestWithIdentity,
} from './app/platform/authentication/request-identity';
import { ServerModule } from './app/server.module';
import { createServer } from './create-server';

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseAnonKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const supabaseSecretKey = process.env['SUPABASE_SECRET_KEY']?.trim();
const pastWeek = () => {
  const end = new Date();
  return {
    start: new Date(end.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
    end: end.toISOString(),
  };
};

const signIn = async (email: string) => {
  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: 'Password123!',
  });

  expect(error).toBeNull();
  expect(data.session?.access_token).toBeTruthy();
  return { client, token: data.session?.access_token ?? '' };
};

@Controller('test/authenticated-entry')
class AuthenticatedEntryTestController {
  @Get()
  identity(@Req() request: RequestWithIdentity): unknown {
    return getRequestIdentity(request);
  }
}

@Module({
  imports: [ServerModule],
  controllers: [AuthenticatedEntryTestController],
})
class AuthenticationIntegrationModule {}

describe('authenticated server entry against local Supabase', () => {
  let app: NestFastifyApplication | undefined;

  beforeEach(() => {
    if (!supabaseSecretKey) {
      throw new Error(
        'Expected the integration runner to provide the local Supabase server key.'
      );
    }

    vi.stubEnv('OMOIKANE_ENV', 'integration');
    vi.stubEnv('SUPABASE_SECRET_KEY', supabaseSecretKey);
    vi.stubEnv('SUPABASE_URL', supabaseUrl);
    vi.stubEnv('SUPABASE_ANON_KEY', supabaseAnonKey);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
  });

  it('accepts a local authenticated user and exposes only canonical identity', async () => {
    const { token } = await signIn('owner@omoikane.local');

    app = await createServer(AuthenticationIntegrationModule);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/test/authenticated-entry',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.json()).toEqual({
      userId: '10000000-0000-4000-8000-000000000001',
    });
  });

  it('starts and observes one channel-scoped deterministic Analysis Run', async () => {
    const { client, token } = await signIn('owner@omoikane.local');
    const { data: workspaces, error } = await client
      .from('current_workspaces')
      .select('workspace_id')
      .eq('status', 'active')
      .limit(1);
    expect(error).toBeNull();
    const workspaceId = workspaces?.[0]?.workspace_id;
    expect(workspaceId).toBeTruthy();
    if (typeof workspaceId !== 'string') {
      throw new Error('Expected an active workspace fixture.');
    }
    const { data: channels, error: channelError } = await client
      .from('current_channels')
      .select('channel_id')
      .eq('workspace_id', workspaceId)
      .eq('channel_status', 'active')
      .limit(1);
    expect(channelError).toBeNull();
    const channelId = channels?.[0]?.channel_id;
    expect(channelId).toBeTruthy();
    if (typeof channelId !== 'string') {
      throw new Error('Expected an active channel fixture.');
    }

    app = await createServer();
    const timeRange = pastWeek();
    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/analysis-runs`,
      headers: { authorization: `Bearer ${token}` },
      payload: { channelId, timeRange },
    });

    expect(started.statusCode).toBe(201);
    expect(started.headers['cache-control']).toBe('private, no-store');
    const run = started.json<{
      readonly id: string;
      readonly workspaceId: string;
      readonly channelId: string;
      readonly timeRange: { readonly start: string; readonly end: string };
      readonly requestedBy: string;
      readonly status: string;
    }>();
    expect(run).toMatchObject({
      workspaceId,
      channelId,
      timeRange,
      requestedBy: '10000000-0000-4000-8000-000000000001',
      status: 'created',
    });

    const observed = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/analysis-runs/${run.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(observed.statusCode).toBe(200);
    expect(observed.json()).toEqual(started.json());
  });

  it('does not reveal an inaccessible workspace to an authenticated outsider', async () => {
    const owner = await signIn('owner@omoikane.local');
    const { data: workspaces } = await owner.client
      .from('current_workspaces')
      .select('workspace_id')
      .eq('status', 'active')
      .limit(1);
    const workspaceId = workspaces?.[0]?.workspace_id;
    expect(workspaceId).toBeTruthy();
    if (typeof workspaceId !== 'string') {
      throw new Error('Expected an active workspace fixture.');
    }
    const { data: channels } = await owner.client
      .from('current_channels')
      .select('channel_id')
      .eq('workspace_id', workspaceId)
      .eq('channel_status', 'active')
      .limit(1);
    const channelId = channels?.[0]?.channel_id;
    expect(channelId).toBeTruthy();
    if (typeof channelId !== 'string') {
      throw new Error('Expected an active channel fixture.');
    }
    const outsider = await signIn('outsider@omoikane.local');

    app = await createServer();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/analysis-runs`,
      headers: { authorization: `Bearer ${outsider.token}` },
      payload: { channelId, timeRange: pastWeek() },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      type: 'https://omoikane.dev/problems/resource-not-found',
      code: 'resource_not_found',
    });
  });

  it('reports the active Supabase Auth dependency as ready', async () => {
    app = await createServer();

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      checks: { supabaseAuth: 'ok' },
    });
  });
});
