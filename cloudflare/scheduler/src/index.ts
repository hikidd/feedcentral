interface Env {
  APP_BASE_URL: string;
  CRON_API_KEY: string;
  FETCH_FEEDS_PATH: string;
  FETCH_USER_SOURCES_PATH: string;
  CLEANUP_ARTICLES_PATH: string;
  FETCH_FEEDS_QUERY?: string;
  FETCH_USER_SOURCES_QUERY?: string;
  CLEANUP_ARTICLES_QUERY?: string;
}

const FETCH_FEEDS_CRON = '0 0-15 * * *';
const FETCH_USER_SOURCES_CRON = '7 0-15 * * *';
const CLEANUP_ARTICLES_CRON = '55 15 * * 1';

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
          fetchFeeds: {
            cron: FETCH_FEEDS_CRON,
            path: env.FETCH_FEEDS_PATH,
            query: env.FETCH_FEEDS_QUERY || '',
          },
          fetchUserSources: {
            cron: FETCH_USER_SOURCES_CRON,
            path: env.FETCH_USER_SOURCES_PATH,
            query: env.FETCH_USER_SOURCES_QUERY || '',
          },
          cleanupArticles: {
            cron: CLEANUP_ARTICLES_CRON,
            path: env.CLEANUP_ARTICLES_PATH,
            query: env.CLEANUP_ARTICLES_QUERY || '',
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
  switch (cron) {
    case FETCH_FEEDS_CRON:
      return {
        name: 'fetch-feeds',
        path: env.FETCH_FEEDS_PATH,
        query: env.FETCH_FEEDS_QUERY,
      };
    case FETCH_USER_SOURCES_CRON:
      return {
        name: 'fetch-user-sources',
        path: env.FETCH_USER_SOURCES_PATH,
        query: env.FETCH_USER_SOURCES_QUERY,
      };
    case CLEANUP_ARTICLES_CRON:
      return {
        name: 'cleanup-articles',
        path: env.CLEANUP_ARTICLES_PATH,
        query: env.CLEANUP_ARTICLES_QUERY,
      };
    default:
      return null;
  }
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
