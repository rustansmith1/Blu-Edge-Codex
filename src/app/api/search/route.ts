import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch, processAllDocuments } from '@/utils/semanticSearch';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const limitParam = searchParams.get('limit');
    
    // Validate query parameter
    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }
    
    // Parse limit parameter
    const limit = limitParam ? parseInt(limitParam, 10) : 5;
    
    // Perform semantic search
    const results = await semanticSearch(query, limit);
    
    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Error in semantic search API:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during semantic search' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Process request body
    const body = await request.json();
    const { action } = body;
    
    // Handle different actions
    if (action === 'process_all') {
      // Process all documents for vector search
      const processedCount = await processAllDocuments();
      
      return NextResponse.json({
        success: true,
        message: `Successfully processed ${processedCount} documents for vector search`,
        processedCount,
      });
    }
    
    // Invalid action
    return NextResponse.json(
      { error: 'Invalid action. Supported actions: process_all' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error in search API:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during search operation' },
      { status: 500 }
    );
  }
}
