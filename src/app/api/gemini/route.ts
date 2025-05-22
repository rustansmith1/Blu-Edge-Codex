import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch } from '@/utils/semanticSearch';
import { createGeminiClient } from '@/utils/geminiClient';
import { extractAndAnalyzeData } from '@/utils/dataAnalysis';
import { generateCouncilTaxReport, analyzeCouncilTaxData } from '@/utils/councilTaxAnalysis';
import { generateAnalysisReport, detectAnalysisType, AnalysisType } from '@/utils/analysisEngine';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to determine if a query requires data analysis
const requiresDataAnalysis = (query: string): boolean => {
  const analysisKeywords = [
    'average', 'mean', 'median', 'calculate', 'sum', 'total', 'percentage', 'compare',
    'difference', 'higher', 'lower', 'more', 'less', 'increase', 'decrease',
    'trend', 'pattern', 'correlation', 'relationship', 'distribution',
    'statistical', 'statistics', 'analytics', 'metric', 'measure',
    'council tax', 'tax rate', 'budget', 'spending', 'expenditure',
    'labour', 'conservative', 'party', 'political', 'control'
  ];
  
  const lowerQuery = query.toLowerCase();
  return analysisKeywords.some(keyword => lowerQuery.includes(keyword.toLowerCase()));
};

/**
 * Extract numerical data from text
 */
const extractNumericalData = (text: string): { value: number, context: string }[] => {
  const percentageRegex = /(\d+(?:\.\d+)?)\s*%/g;
  const numberRegex = /(\d+(?:\.\d+)?)/g;
  
  const results: { value: number, context: string }[] = [];
  
  // Extract percentages first (they're more specific)
  let match;
  while ((match = percentageRegex.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    // Get some context around the number (up to 100 chars before and after)
    const startIndex = Math.max(0, match.index - 100);
    const endIndex = Math.min(text.length, match.index + match[0].length + 100);
    const context = text.substring(startIndex, endIndex);
    
    results.push({ value, context });
  }
  
  // Then extract other numbers if needed
  if (results.length === 0) {
    while ((match = numberRegex.exec(text)) !== null) {
      const value = parseFloat(match[1]);
      const startIndex = Math.max(0, match.index - 100);
      const endIndex = Math.min(text.length, match.index + match[0].length + 100);
      const context = text.substring(startIndex, endIndex);
      
      results.push({ value, context });
    }
  }
  
  return results;
};

/**
 * Extract entities (like council names, political parties) from text
 */
const extractEntities = (text: string): { entity: string, type: string, context: string }[] => {
  const results: { entity: string, type: string, context: string }[] = [];
  
  // Political parties
  const parties = ['Labour', 'Conservative', 'Liberal Democrat', 'Green', 'Independent', 'SNP', 'Plaid Cymru'];
  
  parties.forEach(party => {
    const regex = new RegExp(`\\b${party}\\b`, 'gi');
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const startIndex = Math.max(0, match.index - 100);
      const endIndex = Math.min(text.length, match.index + match[0].length + 100);
      const context = text.substring(startIndex, endIndex);
      
      results.push({ 
        entity: match[0], 
        type: 'political_party',
        context 
      });
    }
  });
  
  // Look for council names (this is a simplified approach)
  const councilRegex = /\b([A-Z][a-z]+(\s+[A-Z][a-z]+)*\s+(Council|Borough|District|County|City|Metropolitan|Unitary|Authority))\b/g;
  let councilMatch;
  
  while ((councilMatch = councilRegex.exec(text)) !== null) {
    const startIndex = Math.max(0, councilMatch.index - 100);
    const endIndex = Math.min(text.length, councilMatch.index + councilMatch[0].length + 100);
    const context = text.substring(startIndex, endIndex);
    
    results.push({ 
      entity: councilMatch[0], 
      type: 'local_authority',
      context 
    });
  }
  
  return results;
};

/**
 * Prepare data for analysis
 */
const prepareDataForAnalysis = (searchResults: any[]) => {
  const data = {
    numericalData: [] as { value: number, context: string, documentTitle: string }[],
    entities: [] as { entity: string, type: string, context: string, documentTitle: string }[],
    documentSummaries: [] as { documentTitle: string, summary: string }[]
  };
  
  searchResults.forEach(result => {
    // Extract numerical data
    const numbers = extractNumericalData(result.content);
    numbers.forEach(num => {
      data.numericalData.push({
        ...num,
        documentTitle: result.documentTitle
      });
    });
    
    // Extract entities
    const entities = extractEntities(result.content);
    entities.forEach(entity => {
      data.entities.push({
        ...entity,
        documentTitle: result.documentTitle
      });
    });
    
    // Add document summary
    if (!data.documentSummaries.some(summary => summary.documentTitle === result.documentTitle)) {
      data.documentSummaries.push({
        documentTitle: result.documentTitle,
        summary: result.content.substring(0, 200) + '...'
      });
    }
  });
  
  return data;
};

// Helper function to extract council tax data from search results
const extractCouncilTaxData = (searchResults: any[]) => {
  const councilTaxData: {
    authority: string;
    politicalControl: string;
    taxRate: number;
    percentageChange: number;
    year: string;
  }[] = [];
  
  // Process each search result
  searchResults.forEach(result => {
    const content = result.content;
    const metadata = result.metadata || {};
    
    // Look for council tax percentage changes
    const percentageMatches = content.match(/([\d.]+)%\s+(?:increase|change|rise)/gi);
    if (percentageMatches) {
      // Try to find authority name in the same chunk
      const authorityMatch = content.match(/([\w\s]+)(?:Council|Authority|Borough|District|County|Unitary|Metropolitan)/i);
      const authority = authorityMatch ? authorityMatch[1].trim() : 'Unknown';
      
      // Try to find political control in the same chunk
      let politicalControl = 'Unknown';
      if (content.toLowerCase().includes('labour') && 
          (content.toLowerCase().includes('control') || content.toLowerCase().includes('run by'))) {
        politicalControl = 'Labour';
      } else if ((content.toLowerCase().includes('conservative') || content.toLowerCase().includes('tory')) && 
                (content.toLowerCase().includes('control') || content.toLowerCase().includes('run by'))) {
        politicalControl = 'Conservative';
      }
      
      // Extract the percentage value
      percentageMatches.forEach(match => {
        const percentMatch = match.match(/([\d.]+)/);
        if (percentMatch) {
          const percentageChange = parseFloat(percentMatch[1]);
          
          // Extract year information if available
          const yearMatch = content.match(/(20\d{2})(?:\s*-\s*|\/)?(20\d{2})/);
          const year = yearMatch ? `${yearMatch[1]}-${yearMatch[2] || (parseInt(yearMatch[1]) + 1)}` : '2025-2026';
          
          councilTaxData.push({
            authority,
            politicalControl,
            taxRate: 0, // Will be filled if found
            percentageChange,
            year
          });
        }
      });
    }
    
    // Look for Band D council tax rates
    const taxRateMatches = content.match(/(?:Band D|average)\s+(?:council tax|CT)\s+(?:of|is|was|:)?\s+[£$]?([\d,]+(?:\.\d+)?)/gi);
    if (taxRateMatches) {
      taxRateMatches.forEach(match => {
        const rateMatch = match.match(/[£$]?([\d,]+(?:\.\d+)?)/);
        if (rateMatch) {
          const taxRate = parseFloat(rateMatch[1].replace(/,/g, ''));
          
          // Try to find authority name in the same chunk
          const authorityMatch = content.match(/([\w\s]+)(?:Council|Authority|Borough|District|County|Unitary|Metropolitan)/i);
          const authority = authorityMatch ? authorityMatch[1].trim() : 'Unknown';
          
          // Update existing entry or create new one
          const existingEntry = councilTaxData.find(entry => entry.authority === authority);
          if (existingEntry) {
            existingEntry.taxRate = taxRate;
          } else {
            councilTaxData.push({
              authority,
              politicalControl: 'Unknown',
              taxRate,
              percentageChange: 0,
              year: '2025-2026'
            });
          }
        }
      });
    }
    
    // Look for explicit political control statements
    const controlMatches = content.match(/([\w\s]+)(?:Council|Authority|Borough|District|County|Unitary|Metropolitan)[\w\s]*\s+(?:is|was|are|were)\s+(?:controlled by|run by|under the control of|led by)\s+(Labour|Conservative|Liberal Democrat|Green|Independent)/gi);
    
    if (controlMatches) {
      controlMatches.forEach(match => {
        // Extract authority name
        const authorityMatch = match.match(/([\w\s]+)(?:Council|Authority|Borough|District|County|Unitary|Metropolitan)/i);
        if (authorityMatch) {
          const authority = authorityMatch[1].trim();
          
          // Extract political party
          const partyMatch = match.match(/(Labour|Conservative|Liberal Democrat|Green|Independent)/i);
          if (partyMatch) {
            const politicalControl = partyMatch[1];
            
            // Update existing entry or create new one
            const existingEntry = councilTaxData.find(entry => 
              entry.authority.toLowerCase().includes(authority.toLowerCase()) || 
              authority.toLowerCase().includes(entry.authority.toLowerCase())
            );
            
            if (existingEntry) {
              existingEntry.politicalControl = politicalControl;
            } else {
              councilTaxData.push({
                authority,
                politicalControl,
                taxRate: 0,
                percentageChange: 0,
                year: '2025-2026'
              });
            }
          }
        }
      });
    }
  });
  
  return councilTaxData;
};

/**
 * Gemini-powered multi-document RAG API route
 */
export async function POST(request: NextRequest) {
  try {
    // Process request body
    const body = await request.json();
    const { query, limit } = body;
    
    // Validate query parameter
    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }
    
    // Parse limit parameter with default
    const documentLimit = limit || 15;
    
    // Check if Gemini API key is configured
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      return NextResponse.json(
        { error: 'Gemini API key is not configured. Please add GEMINI_API_KEY to your .env.local file.' },
        { status: 400 }
      );
    }
    
    // Log API key length for debugging
    console.log('Using Gemini API key with length:', apiKey.length);
    
    // Create Gemini client
    const gemini = createGeminiClient();
    if (!gemini) {
      return NextResponse.json(
        { error: 'Failed to create Gemini client. Please check your API key.' },
        { status: 400 }
      );
    }
    
    // Validate API key
    try {
      const isValid = await gemini.isValidApiKey();
      if (!isValid) {
        return NextResponse.json(
          { error: 'Gemini API key is invalid. Please check your API key.' },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error('Error validating Gemini API key:', error);
      return NextResponse.json(
        { error: 'Error validating Gemini API key. Please check your API key and try again.' },
        { status: 400 }
      );
    }
    
    // Get relevant chunks using semantic search with increased limit for comprehensive analysis
    const searchResults = await semanticSearch(query, documentLimit * 2); // Double the limit for more comprehensive context
    
    // Determine if query requires data analysis
    const needsAnalysis = requiresDataAnalysis(query);
    
    // Detect what type of analysis is needed
    const analysisType = detectAnalysisType(query);
    
    // For analysis queries, use our specialized analysis engine
    if (analysisType !== AnalysisType.GENERAL) {
      try {
        // Generate a comprehensive analysis report using our analysis engine
        const analysisReport = await generateAnalysisReport(query, searchResults);
        
        // If we have a good report, we'll use it directly
        if (analysisReport && analysisReport.length > 500) {
          return NextResponse.json({ 
            response: analysisReport,
            model: 'gemini-1.5-pro',
            success: true,
            analysisType: analysisType
          });
        }
      } catch (error) {
        console.error('Error generating analysis report:', error);
      }
    }
    
    // Prepare data for analysis if needed
    const analysisData = needsAnalysis ? prepareDataForAnalysis(searchResults) : null;
    
    // Extract council tax data for specialized analysis
    const councilTaxData = needsAnalysis ? extractCouncilTaxData(searchResults) : [];
    
    // Perform advanced data analysis using the dataAnalysis module
    let analysisResults = [];
    if (needsAnalysis) {
      try {
        analysisResults = await extractAndAnalyzeData(searchResults.map(result => ({
          title: result.documentTitle,
          content: result.content,
          metadata: result.metadata
        })));
      } catch (error) {
        console.error('Error performing advanced data analysis:', error);
      }
    }
    
    // Combine chunks into context with enhanced document metadata
    const context = searchResults
      .map(result => {
        const metadata = result.metadata as any;
        // Include more detailed document information
        return `Document: ${result.documentTitle} (${metadata?.position || 'Unknown position'})
` +
               `Type: ${metadata?.type || 'Document'}
` +
               `Date: ${metadata?.date || 'Unknown'}
` +
               `Content: ${result.content}
---`;
      })
      .join('\n\n');
      
    // Organize documents by type for better analysis
    const documentsByType: Record<string, any[]> = {};
    searchResults.forEach(result => {
      const type = result.metadata?.type || 'Unknown';
      if (!documentsByType[type]) {
        documentsByType[type] = [];
      }
      documentsByType[type].push(result);
    });
    
    // Add document type summary to help with analysis
    let documentTypeSummary = '\n\nDocument Types Summary:\n';
    Object.entries(documentsByType).forEach(([type, docs]) => {
      documentTypeSummary += `- ${type}: ${docs.length} documents\n`;
    });
    
    // Prepare system message based on query type
    let systemMessage = `You are BlueEdge, an advanced AI assistant for the Conservative Research Department. 
Your purpose is to analyze political documents and provide factual, data-driven insights.

You will be given a query and relevant excerpts from multiple documents.
Synthesize information from all provided document excerpts to answer the query comprehensively.`;
    
    // Add specific instructions for data analysis if needed
    if (needsAnalysis) {
      systemMessage += `

This query requires data analysis. When performing calculations or comparisons:
- Extract all relevant numerical data from the documents
- Perform calculations accurately using all available data, not just sample data
- Show your calculation process step by step
- Present results with proper statistical context
- If comparing entities (e.g., political parties), ensure you use representative samples
- Clearly state your methodology and any limitations in the data

For council tax analysis specifically:
- Match local authorities with their political control
- Calculate averages by political party accurately
- Consider the type of authority (district, unitary, etc.) in your analysis
- Present both the raw data and the calculated averages
- Explain any outliers or anomalies in the data`;
    }
    
    systemMessage += `

FORMATTING REQUIREMENTS:
- Present your analysis in clean, well-structured format with clear headings
- Use proper markdown tables with headers and aligned columns when presenting structured data
- Use numbered lists (1. 2. 3.) for sequential items
- Use headings (## and ###) to organize your response clearly
- Keep your analysis concise and focused on the most important insights

Always cite the specific document sources in your answer.
If the documents don't contain sufficient information to answer the query, explain what specific information is missing.`;
    
    // Prepare user message with analysis data if available
    let userMessage = `Query: ${query}\n\nDocument Excerpts:\n${context}${documentTypeSummary}\n\nIMPORTANT ANALYSIS INSTRUCTIONS:\n1. Use ALL available data to perform calculations
2. When comparing political parties, ensure you match local authorities with their political control correctly
3. Show your calculation methodology step by step
4. Present raw data in tables where appropriate
5. Provide clear conclusions based on the data`;
    
    // Add council tax data if available
    if (councilTaxData && councilTaxData.length > 0) {
      userMessage += '\n\nEXTRACTED COUNCIL TAX DATA:\n';
      
      // Group by political control
      const labourCouncils = councilTaxData.filter(c => c.politicalControl === 'Labour');
      const conservativeCouncils = councilTaxData.filter(c => c.politicalControl === 'Conservative');
      
      // Calculate averages
      const labourAvg = labourCouncils.length > 0 
        ? labourCouncils.reduce((sum, c) => sum + c.percentageChange, 0) / labourCouncils.length 
        : 0;
      
      const conservativeAvg = conservativeCouncils.length > 0 
        ? conservativeCouncils.reduce((sum, c) => sum + c.percentageChange, 0) / conservativeCouncils.length 
        : 0;
      
      userMessage += `Labour-controlled councils (${labourCouncils.length}): Average increase ${labourAvg.toFixed(2)}%\n`;
      userMessage += `Conservative-controlled councils (${conservativeCouncils.length}): Average increase ${conservativeAvg.toFixed(2)}%\n\n`;
      
      // Add detailed data table
      userMessage += 'COUNCIL TAX DATA TABLE:\n';
      userMessage += 'Authority | Political Control | % Increase | Band D Rate\n';
      userMessage += '--- | --- | --- | ---\n';
      
      // Add up to 20 entries to avoid making the message too long
      const sortedData = [...councilTaxData].sort((a, b) => 
        a.politicalControl === b.politicalControl 
          ? 0 
          : a.politicalControl === 'Labour' ? -1 : 1
      );
      
      sortedData.slice(0, 20).forEach(c => {
        userMessage += `${c.authority} | ${c.politicalControl} | ${c.percentageChange}% | ${c.taxRate > 0 ? '£' + c.taxRate.toFixed(2) : 'N/A'}\n`;
      });
      
      if (sortedData.length > 20) {
        userMessage += `... and ${sortedData.length - 20} more entries\n`;
      }
    }
    
    // Add advanced analysis results if available
    if (analysisResults && analysisResults.length > 0) {
      userMessage += '\n\nADVANCED ANALYSIS RESULTS:\n';
      
      analysisResults.forEach(result => {
        if (result.type === 'group_comparison' && result.description.includes('Labour') && result.description.includes('Conservative')) {
          userMessage += `PARTY COMPARISON: ${result.description}\n`;
          userMessage += `- ${result.data.Labour ? result.data.Labour.average.toFixed(2) : 'N/A'}% average for Labour (${result.data.Labour ? result.data.Labour.count : 0} councils)\n`;
          userMessage += `- ${result.data.Conservative ? result.data.Conservative.average.toFixed(2) : 'N/A'}% average for Conservative (${result.data.Conservative ? result.data.Conservative.count : 0} councils)\n`;
          userMessage += `- Difference: ${result.data.difference ? result.data.difference.toFixed(2) : 'N/A'}%\n`;
          userMessage += `- Higher increases by: ${result.data.higherGroup || 'N/A'}\n`;
          userMessage += `- Methodology: ${result.methodology}\n\n`;
        }
      });
    }
    
    if (needsAnalysis && analysisData) {
      // Add extracted numerical data
      if (analysisData.numericalData.length > 0) {
        userMessage += '\n\nExtracted Numerical Data:\n';
        analysisData.numericalData.forEach(item => {
          userMessage += `- Value: ${item.value}, Document: ${item.documentTitle}, Context: "${item.context.trim()}"\n`;
        });
      }
      
      // Add extracted entities
      if (analysisData.entities.length > 0) {
        userMessage += '\n\nExtracted Entities:\n';
        analysisData.entities.forEach(item => {
          userMessage += `- Entity: ${item.entity}, Type: ${item.type}, Document: ${item.documentTitle}\n`;
        });
      }
    }
    
    // Use Gemini to generate response
    try {
      // Use a lower temperature for more factual and analytical responses
      const geminiResponse = await gemini.generateContent(
        systemMessage,
        userMessage,
        0.1, // Lower temperature for more factual responses
        4096  // Increased token limit for more detailed analysis
      );
      
      return NextResponse.json({ 
        response: geminiResponse,
        model: 'gemini-1.5-pro',
        success: true,
        documentCount: searchResults.length,
        analysisType: needsAnalysis ? 'comprehensive' : 'standard'
      });
    } catch (geminiError: any) {
      console.error('Error using Gemini:', geminiError);
      
      return NextResponse.json(
        { 
          error: 'Error using Gemini API: ' + (geminiError.message || 'Unknown error'),
          details: 'Please check your Gemini API key and ensure it has sufficient quota.'
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in Gemini RAG API:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during Gemini RAG' },
      { status: 500 }
    );
  }
}
