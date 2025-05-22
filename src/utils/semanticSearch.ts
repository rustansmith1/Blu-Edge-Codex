import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';
import { createGeminiClient, GeminiClient } from './geminiClient';

const prisma = new PrismaClient();

// Initialize OpenAI API
const getOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  
  return new OpenAI({
    apiKey,
  });
};

// Initialize Gemini API
const getGemini = (): GeminiClient | null => {
  return createGeminiClient();
};

// Text splitter for chunking documents
const getTextSplitter = () => {
  return new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
};

// Store document chunks in memory for vector search
const documentChunks = new Map<string, { content: string, metadata: any }[]>();

// Create document chunks for vector search
export const createDocumentChunks = async (documentId: string) => {
  try {
    // Get document from database
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });
    
    if (!document) {
      throw new Error(`Document with ID ${documentId} not found`);
    }
    
    // Split document into chunks
    const textSplitter = getTextSplitter();
    const textChunks = await textSplitter.splitText(document.content);
    
    // Create chunks in memory
    const chunks = [];
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      
      chunks.push({
        content: chunk,
        metadata: {
          documentId,
          index: i,
          title: document.title,
          position: `Chunk ${i + 1} of ${textChunks.length}`,
        },
      });
    }
    
    // Store chunks in memory
    documentChunks.set(documentId, chunks);
    
    return textChunks.length;
  } catch (error) {
    console.error('Error creating document chunks:', error);
    throw error;
  }
};

// Calculate embeddings for a text using OpenAI
export const getEmbedding = async (text: string) => {
  try {
    const openai = getOpenAI();
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error calculating embedding:', error);
    throw error;
  }
};

// Calculate cosine similarity between two vectors
const cosineSimilarity = (vecA: number[], vecB: number[]) => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// Semantic search across documents
export const semanticSearch = async (query: string, limit: number = 5) => {
  try {
    // Get query embedding
    const queryEmbedding = await getEmbedding(query);
    
    // Get all documents from database
    const documents = await prisma.document.findMany({
      select: {
        id: true,
        title: true,
      },
    });
    
    // Calculate similarity for each chunk across all documents
    const results = [];
    
    // Process each document
    for (const document of documents) {
      // Get chunks for this document (or create them if they don't exist)
      let chunks = documentChunks.get(document.id);
      if (!chunks) {
        // Create chunks for this document
        await createDocumentChunks(document.id);
        chunks = documentChunks.get(document.id) || [];
      }
      
      // Process each chunk
      for (const chunk of chunks) {
        // Get embedding for chunk
        const embedding = await getEmbedding(chunk.content);
        
        // Calculate similarity
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        
        results.push({
          chunk,
          document,
          similarity,
        });
      }
    }
    
    // Sort by similarity and take top results
    const topResults = results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    // Format results
    return topResults.map(result => ({
      content: result.chunk.content,
      documentId: result.document.id,
      documentTitle: result.document.title,
      similarity: result.similarity,
      metadata: result.chunk.metadata,
    }));
  } catch (error) {
    console.error('Error performing semantic search:', error);
    throw error;
  }
};

// Detect if query requires data analysis
const requiresDataAnalysis = (query: string): boolean => {
  const analysisKeywords = [
    'average', 'mean', 'median', 'calculate', 'sum', 'total', 'percentage', 'compare',
    'difference', 'higher', 'lower', 'more', 'less', 'increase', 'decrease',
    'trend', 'analysis', 'statistics', 'statistical', 'correlation', 'relationship',
    'council tax', 'raise', 'raised', 'political control', 'labour', 'conservative',
    'lib dem', 'liberal democrat', 'green', 'independent', 'party', 'controlled'
  ];
  
  return analysisKeywords.some(keyword => 
    query.toLowerCase().includes(keyword.toLowerCase())
  );
};

// Extract numerical data from search results for analysis
export const extractNumericalData = (searchResults: any[]): { value: number, isPercentage: boolean, hasCurrency: boolean, context: string, documentTitle: string, isImportant: boolean, entity: string, metadata: any }[] => {
  const numericalData: { value: number, isPercentage: boolean, hasCurrency: boolean, context: string, documentTitle: string, isImportant: boolean, entity: string, metadata: any }[] = [];
  
  // Enhanced regular expression to match numbers (including those with commas, decimals, percentages, and currency symbols)
  const numberRegex = /(?:£|\$|€)?\s*\b\d+(?:[,.]\d+)?%?\b/g;
  
  // Keywords that indicate important numerical data
  const financialKeywords = [
    'council tax', 'increase', 'decrease', 'rate', 'percentage', 'budget', 'funding',
    'allocation', 'spending', 'cost', 'expense', 'revenue', 'income', 'deficit', 'surplus',
    'band', 'authority', 'borough', 'district', 'county', 'unitary', 'metropolitan'
  ];
  
  searchResults.forEach(result => {
    const matches = result.content.match(numberRegex);
    if (matches) {
      matches.forEach(match => {
        // Clean the match (remove commas, handle currency symbols)
        let cleanedMatch = match.replace(/,/g, '');
        const hasCurrency = /[£$€]/.test(cleanedMatch);
        if (hasCurrency) {
          cleanedMatch = cleanedMatch.replace(/[£$€]\s*/g, '');
        }
        
        const isPercentage = cleanedMatch.endsWith('%');
        const value = parseFloat(isPercentage ? cleanedMatch.slice(0, -1) : cleanedMatch);
        
        // Get more context around the number
        const startIndex = Math.max(0, result.content.indexOf(match) - 100);
        const endIndex = Math.min(result.content.length, result.content.indexOf(match) + match.length + 100);
        const context = result.content.substring(startIndex, endIndex);
        
        // Determine if this number is likely important based on surrounding keywords
        const isImportant = financialKeywords.some(keyword => 
          context.toLowerCase().includes(keyword.toLowerCase())
        );
        
        // Extract the entity this number relates to (if any)
        let entity = '';
        const entityMatch = context.match(/(?:council|authority|borough|district|county|unitary|metropolitan)\s+(?:of\s+)?([A-Z][a-z]+(\s+[A-Z][a-z]+)*)/i);
        if (entityMatch && entityMatch[1]) {
          entity = entityMatch[1].trim();
        }
        
        numericalData.push({
          value,
          isPercentage,
          hasCurrency,
          context,
          documentTitle: result.documentTitle,
          isImportant,
          entity,
          metadata: result.metadata
        });
      });
    }
  });
  
  return numericalData;
};

// Extract entities (like council names, political parties) from text
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

// Define SearchResult interface if not already defined
interface SearchResult {
  documentTitle: string;
  content: string;
  metadata: any;
}

// Prepare data for analysis
const prepareDataForAnalysis = (searchResults: SearchResult[]) => {
  // Extract numerical data
  const numericalData = extractNumericalData(searchResults);
  
  // Extract entities
  const entities: { entity: string, type: string, documentTitle: string }[] = [];
  searchResults.forEach(result => {
    const extractedEntities = extractEntities(result.content);
    extractedEntities.forEach(entity => {
      entities.push({
        ...entity,
        documentTitle: result.documentTitle
      });
    });
  });
  
  // Extract council tax data specifically
  const councilTaxData: {
    authority: string,
    politicalControl: string,
    taxRate: number,
    percentageChange: number,
    year: string,
    documentTitle: string
  }[] = [];
  
  // Look for patterns that indicate council tax data
  searchResults.forEach(result => {
    // Look for council tax percentage changes
    const percentageChangeMatches = result.content.match(/([\w\s]+)(?:Council|Authority|Borough|District|County|Unitary|Metropolitan)[\w\s]*\s+([\d.]+)%\s+(?:increase|change|rise)/gi);
    if (percentageChangeMatches) {
      percentageChangeMatches.forEach(match => {
        // Extract authority name
        const authorityMatch = match.match(/([\w\s]+)(?:Council|Authority|Borough|District|County|Unitary|Metropolitan)/i);
        const authority = authorityMatch ? authorityMatch[1].trim() : 'Unknown';
        
        // Extract percentage change
        const percentageMatch = match.match(/([\d.]+)%/);
        const percentageChange = percentageMatch ? parseFloat(percentageMatch[1]) : 0;
        
        // Look for political control in nearby context
        let politicalControl = 'Unknown';
        const politicalMatches = result.content.match(/(?:Labour|Conservative|Liberal Democrat|Green|Independent)\s+(?:control|controlled|run|led)/gi);
        if (politicalMatches && politicalMatches.length > 0) {
          const controlMatch = politicalMatches[0].match(/(Labour|Conservative|Liberal Democrat|Green|Independent)/i);
          if (controlMatch) {
            politicalControl = controlMatch[1];
          }
        }
        
        // Extract year information
        const yearMatch = result.content.match(/(20\d{2})(?:\s*-\s*|\/)?(20\d{2})/);
        const year = yearMatch ? `${yearMatch[1]}-${yearMatch[2] || (parseInt(yearMatch[1]) + 1)}` : 'Unknown';
        
        councilTaxData.push({
          authority,
          politicalControl,
          taxRate: 0, // Will be filled if found
          percentageChange,
          year,
          documentTitle: result.documentTitle
        });
      });
    }
    
    // Look for specific council tax rates
    const taxRateMatches = result.content.match(/(?:Band D|average)\s+(?:council tax|CT)\s+(?:of|is|was|:)?\s+[£$]?([\d,]+(?:\.\d+)?)/gi);
    if (taxRateMatches) {
      taxRateMatches.forEach(match => {
        // Extract the tax rate value
        const rateMatch = match.match(/[£$]?([\d,]+(?:\.\d+)?)/);
        if (rateMatch) {
          const taxRate = parseFloat(rateMatch[1].replace(/,/g, ''));
          
          // Try to match this with an existing entry or create a new one
          let matched = false;
          for (const entry of councilTaxData) {
            // If we find a matching authority in the same document, update the tax rate
            if (entry.documentTitle === result.documentTitle && entry.taxRate === 0) {
              entry.taxRate = taxRate;
              matched = true;
              break;
            }
          }
          
          // If no match found, create a new entry
          if (!matched) {
            // Try to extract authority name from nearby context
            const contextStart = Math.max(0, result.content.indexOf(match) - 200);
            const contextEnd = Math.min(result.content.length, result.content.indexOf(match) + match.length + 200);
            const context = result.content.substring(contextStart, contextEnd);
            
            const authorityMatch = context.match(/([\w\s]+)(?:Council|Authority|Borough|District|County|Unitary|Metropolitan)/i);
            const authority = authorityMatch ? authorityMatch[1].trim() : 'Unknown';
            
            // Extract year information
            const yearMatch = context.match(/(20\d{2})(?:\s*-\s*|\/)?(20\d{2})/);
            const year = yearMatch ? `${yearMatch[1]}-${yearMatch[2] || (parseInt(yearMatch[1]) + 1)}` : 'Unknown';
            
            councilTaxData.push({
              authority,
              politicalControl: 'Unknown',
              taxRate,
              percentageChange: 0,
              year,
              documentTitle: result.documentTitle
            });
          }
        }
      });
    }
  });
  
  // Match political control data with council tax data
  searchResults.forEach(result => {
    // Look for explicit political control statements
    const controlMatches = result.content.match(/([\w\s]+)(?:Council|Authority|Borough|District|County|Unitary|Metropolitan)[\w\s]*\s+(?:is|was|are|were)\s+(?:controlled by|run by|under the control of|led by)\s+(Labour|Conservative|Liberal Democrat|Green|Independent)/gi);
    
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
            
            // Update any matching council tax entries
            for (const entry of councilTaxData) {
              if (entry.authority.toLowerCase().includes(authority.toLowerCase()) || 
                  authority.toLowerCase().includes(entry.authority.toLowerCase())) {
                entry.politicalControl = politicalControl;
              }
            }
          }
        }
      });
    }
  });
  
  return {
    numericalData,
    entities,
    councilTaxData
  };
};

// Calculate approximate token count (rough estimate)
const estimateTokenCount = (text: string): number => {
  // A very rough estimate: 1 token ~= 4 characters for English text
  return Math.ceil(text.length / 4);
};

// Truncate context to fit within token limits
const truncateContext = (context: string, maxTokens: number): string => {
  const estimatedTokens = estimateTokenCount(context);
  
  if (estimatedTokens <= maxTokens) {
    return context;
  }
  
  // If we need to truncate, keep documents but shorten their content
  const documents = context.split('---').filter(Boolean);
  const avgTokensPerDoc = Math.floor(maxTokens / documents.length);
  
  return documents.map(doc => {
    const parts = doc.split('Content: ');
    if (parts.length < 2) return doc;
    
    const header = parts[0] + 'Content: ';
    const content = parts[1];
    
    // Estimate tokens for header
    const headerTokens = estimateTokenCount(header);
    const availableTokens = avgTokensPerDoc - headerTokens;
    
    // Truncate content to fit available tokens
    if (estimateTokenCount(content) > availableTokens) {
      const truncatedContent = content.substring(0, availableTokens * 4) + '... [truncated]';
      return header + truncatedContent;
    }
    
    return doc;
  }).join('---\n\n');
};

// Multi-document RAG with enhanced data analysis and model selection based on content size
export const multiDocumentRAG = async (query: string, limit: number = 10) => {
  try {
    // Get relevant chunks using semantic search
    const searchResults = await semanticSearch(query, limit);
    
    // Determine if query requires data analysis
    const needsAnalysis = requiresDataAnalysis(query);
    
    // Prepare data for analysis if needed
    const analysisData = needsAnalysis ? prepareDataForAnalysis(searchResults) : null;
    
    // Combine chunks into context
    const context = searchResults
      .map(result => {
        const metadata = result.metadata as any;
        return `Document: ${result.documentTitle} (${metadata?.position || 'Unknown position'})\nContent: ${result.content}\n---`;
      })
      .join('\n\n');
    
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
    let userMessage = `Query: ${query}\n\nDocument Excerpts:\n${context}`;
    
    if (needsAnalysis && analysisData) {
      // Add extracted numerical data
      if (analysisData.numericalData && analysisData.numericalData.length > 0) {
        userMessage += '\n\nExtracted Numerical Data:\n';
        analysisData.numericalData.forEach(item => {
          userMessage += `- Value: ${item.value}, Document: ${item.documentTitle}, Context: "${item.context.trim()}"\n`;
        });
      }
      
      // Add extracted entities (limited to most relevant)
      if (analysisData.entities && analysisData.entities.length > 0) {
        userMessage += '\n\nExtracted Entities:\n';
        // Group entities by type
        const groupedEntities: Record<string, string[]> = {};
        analysisData.entities.forEach(item => {
          if (!groupedEntities[item.type]) {
            groupedEntities[item.type] = [];
          }
          if (!groupedEntities[item.type].includes(item.entity)) {
            groupedEntities[item.type].push(item.entity);
          }
        });
        
        // Output grouped entities
        Object.entries(groupedEntities).forEach(([type, entities]) => {
          userMessage += `- ${type}: ${entities.join(', ')}\n`;
        });
      }
    }
    
    // Check final token count
    const totalTokens = estimateTokenCount(systemMessage) + estimateTokenCount(userMessage);
    console.log(`Estimated token count: ${totalTokens}`);
    
    // Check if we should use Gemini for large documents
    const useGemini = totalTokens > 100000; // Threshold for switching to Gemini
    
    if (useGemini) {
      // Use Gemini for large documents
      const gemini = getGemini();
      if (!gemini) {
        throw new Error('Gemini API key is not configured. Please add GEMINI_API_KEY to your .env.local file.');
      }
      
      try {
        const geminiResponse = await gemini.generateContent(
          systemMessage,
          userMessage,
          0.2,
          2048
        );
        
        return geminiResponse;
      } catch (geminiError: any) {
        console.error('Error using Gemini:', geminiError);
        throw new Error(`Error using Gemini API: ${geminiError.message || 'Unknown error'}`);
      }
    }
    
    // Use OpenAI for standard documents
    const openai = getOpenAI();
    
    // Apply token limit management for OpenAI
    const maxContextTokens = 7000; // Maximum tokens for context (leaving room for system message and completion)
    let truncatedContext = context;
    
    // If we're over the token limit, truncate the context
    if (totalTokens > 8000) {
      console.log('Token count exceeds limit, truncating context...');
      truncatedContext = truncateContext(context, maxContextTokens);
      userMessage = `Query: ${query}\n\nDocument Excerpts:\n${truncatedContext}`;
      
      if (needsAnalysis && analysisData) {
        // Re-add analysis data to truncated message
        if (analysisData.numericalData && analysisData.numericalData.length > 0) {
          userMessage += '\n\nExtracted Numerical Data:\n';
          analysisData.numericalData.forEach(item => {
            userMessage += `- Value: ${item.value}, Document: ${item.documentTitle}, Context: "${item.context.trim()}"\n`;
          });
        }
        
        if (analysisData.entities && analysisData.entities.length > 0) {
          userMessage += '\n\nExtracted Entities:\n';
          // Create a simplified version of entity grouping for truncated context
          const entityTypes = Array.from(new Set(analysisData.entities.map(e => e.type)));
          entityTypes.forEach(type => {
            const entitiesOfType = Array.from(new Set(analysisData.entities
              .filter(e => e.type === type)
              .map(e => e.entity)));
            userMessage += `- ${type}: ${entitiesOfType.join(', ')}\n`;
          });
        }
      }
    }
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemMessage,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });
      
      return response.choices[0].message?.content || 'No response generated';
    } catch (apiError: any) {
      // If we still hit token limits, try with even less context
      if (apiError.message && apiError.message.includes('Request too large')) {
        console.log('Hit token limit, reducing context further...');
        
        // Further reduce context by half
        const furtherTruncatedContext = truncateContext(truncatedContext, Math.floor(maxContextTokens / 2));
        const reducedUserMessage = `Query: ${query}\n\nDocument Excerpts:\n${furtherTruncatedContext}\n\nNote: Document excerpts have been significantly truncated due to length constraints.`;
        
        const retryResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: systemMessage,
            },
            {
              role: 'user',
              content: reducedUserMessage,
            },
          ],
          temperature: 0.2,
          max_tokens: 1500,
        });
        
        return (retryResponse.choices[0].message?.content || 'No response generated') + 
               '\n\n*Note: Analysis was performed with reduced document context due to length constraints.*';
      } else {
        // Re-throw other errors
        throw apiError;
      }
    }
  } catch (error) {
    console.error('Error performing multi-document RAG:', error);
    
    // Provide a more user-friendly error message for rate limits
    if (error instanceof Error && error.message.includes('429')) {
      return 'The analysis could not be completed because the documents contain too much text. Please try a more specific question or upload smaller documents.';
    }
    
    throw error;
  }
};

// Process all documents for vector search
export const processAllDocuments = async () => {
  try {
    // Get all documents
    const documents = await prisma.document.findMany();
    
    console.log(`Processing ${documents.length} documents for vector search...`);
    
    // Process each document
    for (const document of documents) {
      console.log(`Processing document: ${document.title} (${document.id})`);
      await createDocumentChunks(document.id);
    }
    
    console.log('All documents processed successfully');
    
    return documents.length;
  } catch (error) {
    console.error('Error processing documents for vector search:', error);
    throw error;
  }
};
