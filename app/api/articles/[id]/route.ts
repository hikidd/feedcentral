import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/articles/[id]
 * Fetch single public article by ID
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Try to find in default articles first
    const article = await prisma.article.findFirst({
      where: { 
        id,
        deletedAt: null, // Only show non-deleted articles
      },
      include: {
        source: {
          select: {
            id: true,
            name: true,
            url: true,
            logoUrl: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
            icon: true,
          },
        },
      },
    });

    if (article) {
      return NextResponse.json({
        success: true,
        data: article,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Article not found',
      },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('Error fetching article:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch article',
      },
      { status: 500 }
    );
  }
}
