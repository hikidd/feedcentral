interface Env {
  APP_BASE_URL: string;
  CRON_API_KEY: string;
  RUN_ALL_PATH: string;
  RUN_ALL_QUERY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        baseUrl: env.APP_BASE_URL,
        jobs: {
          runAll: {
            path: env.RUN_ALL_PATH,
            query: env.RUN_ALL_QUERY || '',
          },
        },
      });
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // The schedule lives in Cloudflare (dashboard or wrangler.toml), not here.
    // Matching on an exact cron expression meant that editing the schedule in
    // the dashboard silently turned the Worker into a no-op, so run the job for
    // whatever trigger fires.
    console.log(`Cron fired: ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()}`);

    ctx.waitUntil(runJob(env));
  },
};

async function runJob(env: Env): Promise<void> {
  if (!env.CRON_API_KEY) {
    // Fail loudly: without the key the app answers 401 and the run is wasted.
    console.error('CRON_API_KEY is not configured; refusing to call the app');
    throw new Error('CRON_API_KEY is not configured');
  }

  const url = buildUrl(env.APP_BASE_URL, env.RUN_ALL_PATH, env.RUN_ALL_QUERY);
  const name = 'run-all';

  console.log(`Running ${name}: ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CRON_API_KEY}`,
    },
  });

  const body = await response.text();

  if (!response.ok) {
    console.error(`Job ${name} failed with ${response.status}: ${body}`);
    throw new Error(`Job ${name} failed with status ${response.status}`);
  }

  console.log(`Job ${name} completed with ${response.status}: ${body}`);
}

function buildUrl(baseUrl: string, path: string, query?: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(normalizedPath, normalizedBaseUrl);

  if (query) {
    const params = new URLSearchParams(query);
    params.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  }

  return url.toString();
}
