import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { fetchSingleSource } from '@/lib/rss-parser';

function classifyFetchError(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : undefined;

  if (code === 'SOURCE_NOT_FOUND') {
    return {
      status: 404,
      body: {
        success: false,
        error: 'Source not found',
      },
    };
  }

  if (code === 'SOURCE_INACTIVE') {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Source is inactive',
      },
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      error: 'Failed to fetch source',
    },
  };
}

/**
 * POST /api/admin/sources/[id]/fetch
 * Fetch a single source immediately (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAdmin(request, async () => {
    try {
      const { id } = await params;
      const result = await fetchSingleSource(id);

      return NextResponse.json({
        success: true,
        message: 'Source fetched successfully',
        data: {
          found: result.found,
          added: result.added,
        },
      });
    } catch (error) {
      console.error('Error fetching source:', error);

      const { status, body } = classifyFetchError(error);
      return NextResponse.json(body, { status });
    }
  });
}
