interface Env {
  APP_BASE_URL: string;
  CRON_API_KEY: string;
  RUN_ALL_PATH: string;
  RUN_ALL_QUERY?: string;
}

const RUN_ALL_CRON = '0 0-10 * * *';

type JobConfig = {
  name: string;
  path: string;
  query?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        baseUrl: env.APP_BASE_URL,
        jobs: {
          runAll: {
            cron: RUN_ALL_CRON,
            path: env.RUN_ALL_PATH,
            query: env.RUN_ALL_QUERY || '',
          },
        },
      });
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const job = getJobForCron(controller.cron, env);

    if (!job) {
      console.warn(`No job configured for cron: ${controller.cron}`);
      return;
    }

    ctx.waitUntil(runJob(job, env));
  },
};

function getJobForCron(cron: string, env: Env): JobConfig | null {
  if (cron !== RUN_ALL_CRON) {
    return null;
  }

  return {
    name: 'run-all',
    path: env.RUN_ALL_PATH,
    query: env.RUN_ALL_QUERY,
  };
}

async function runJob(job: JobConfig, env: Env): Promise<void> {
  const url = buildUrl(env.APP_BASE_URL, job.path, job.query);

  console.log(`Running ${job.name}: ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CRON_API_KEY}`,
    },
  });

  const body = await response.text();

  if (!response.ok) {
    console.error(`Job ${job.name} failed with ${response.status}: ${body}`);
    throw new Error(`Job ${job.name} failed with status ${response.status}`);
  }

  console.log(`Job ${job.name} completed with ${response.status}: ${body}`);
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
