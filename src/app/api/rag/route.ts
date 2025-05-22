import { NextRequest, NextResponse } from 'next/server';
import { multiDocumentRAG } from '@/utils/semanticSearch';
import { extractAndAnalyzeData } from '@/utils/dataAnalysis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Check if query is related to council tax analysis
const isCouncilTaxQuery = (query: string): boolean => {
  const keywords = [
    'council tax', 'tax increase', 'tax rate', 'local authority', 'political control',
    'labour council', 'conservative council', 'lib dem council', 'raise council tax',
    'council tax comparison', 'average council tax'
  ];
  
  return keywords.some(keyword => query.toLowerCase().includes(keyword.toLowerCase()));
};

export async function POST(request: NextRequest) {
  try {
    // Process request body
    const body = await request.json();
    const { query, limit, performAnalysis } = body;
    
    // Validate query parameter
    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }
    
    // Parse limit parameter with default
    const documentLimit = limit || 10;
    
    // Determine if we should perform data analysis
    const shouldAnalyze = performAnalysis || isCouncilTaxQuery(query);
    
    // Get relevant documents for analysis if needed
    let analysisResults = null;
    if (shouldAnalyze) {
      try {
        // Get all documents from database
        const documents = await prisma.document.findMany({
          select: {
            id: true,
            title: true,
            content: true,
            metadata: true,
          },
        });
        
        // Perform data analysis
        analysisResults = await extractAndAnalyzeData(documents);
      } catch (analysisError) {
        console.error('Error in data analysis:', analysisError);
        // Continue even if analysis fails
      }
    }
    
    // Perform multi-document RAG
    const response = await multiDocumentRAG(query, documentLimit);
    
    return NextResponse.json({ 
      response,
      analysisResults,
      success: true 
    });
  } catch (error: any) {
    console.error('Error in multi-document RAG API:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during multi-document RAG' },
      { status: 500 }
    );
  }
}
