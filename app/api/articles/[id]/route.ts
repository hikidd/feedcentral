import { NextResponse } from 'next/server';
import { getPublicArticle } from '@/lib/articles/get-public-article';

const ARTICLE_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=1800';
const ARTICLE_NOT_FOUND_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const article = await getPublicArticle(id);

    if (!article) {
      const response = NextResponse.json(
        {
          success: false,
          error: 'Article not found',
        },
        { status: 404 }
      );
      response.headers.set('Cache-Control', ARTICLE_NOT_FOUND_CACHE_CONTROL);
      return response;
    }

    const response = NextResponse.json({
      success: true,
      data: article,
    });
    response.headers.set('Cache-Control', ARTICLE_CACHE_CONTROL);
    return response;
  } catch (error) {
    console.error('Error fetching article:', error);
    const response = NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch article',
      },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
