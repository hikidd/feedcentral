import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

/**
 * GET /api/admin/sources
 * Get all RSS sources (admin only)
 */
export async function GET(request: NextRequest) {
  return requireAdmin(request, async () => {
    try {
      const sources = await prisma.source.findMany({
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              color: true,
            },
          },
          feedJobs: {
            orderBy: { startedAt: 'desc' },
            take: 1,
            select: {
              status: true,
              error: true,
              articlesFound: true,
              articlesAdded: true,
              completedAt: true,
            },
          },
          _count: {
            select: {
              articles: true,
              feedJobs: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return NextResponse.json({
        success: true,
        data: sources.map(({ feedJobs, ...source }) => ({
          ...source,
          lastJob: feedJobs[0] ?? null,
        })),
      });
    } catch (error: any) {
      console.error('Error fetching sources:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch sources',
          message: error.message,
        },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/admin/sources
 * Create new RSS source (admin only)
 */
export async function POST(request: NextRequest) {
  return requireAdmin(request, async () => {
    try {
      const body = await request.json();
      const { name, url, feedUrl, categoryId, logoUrl, fetchInterval } = body;

      // Validate required fields
      if (!name || !url || !feedUrl || !categoryId) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required fields: name, url, feedUrl, categoryId',
          },
          { status: 400 }
        );
      }

      // Create source
      const source = await prisma.source.create({
        data: {
          name,
          url,
          feedUrl,
          categoryId,
          logoUrl: logoUrl || null,
          fetchInterval: fetchInterval || 30,
          isActive: true,
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      return NextResponse.json({
        success: true,
        data: source,
      }, { status: 201 });
    } catch (error: any) {
      console.error('Error creating source:', error);
      
      // Handle unique constraint violation
      if (error.code === 'P2002') {
        return NextResponse.json(
          {
            success: false,
            error: 'Source with this feed URL already exists',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create source',
          message: error.message,
        },
        { status: 500 }
      );
    }
  });
}
