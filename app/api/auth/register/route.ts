import { NextResponse } from 'next/server';

/**
 * POST /api/auth/register
 * Public self-registration is disabled for this single-owner site.
 */
export async function POST(_request: Request) {
  return NextResponse.json(
    {
      success: false,
      error: 'Registration is disabled',
    },
    { status: 403 }
  );
}
