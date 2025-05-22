import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import OpenAI from 'openai';

const prisma = new PrismaClient();
let openai: OpenAI | null = null;

export async function POST(request: NextRequest) {
  try {
    const { documentId, message } = await request.json();

    if (!documentId || !message) {
      return NextResponse.json(
        { error: 'Document ID and message are required' },
        { status: 400 }
      );
    }

    // Retrieve the document from the database
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Find or create a chat for this document
    let chat = await prisma.chat.findFirst({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: { documentId },
      });
    }

    // Save the user message
    const userMessage = await prisma.message.create({
      data: {
        chatId: chat.id,
        role: 'user',
        content: message,
      },
    });

    // Check if OpenAI API key is configured
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured. Please add your API key to the .env.local file.' },
        { status: 500 }
      );
    }
    
    try {
      // Initialize OpenAI client if not already initialized
      if (!openai) {
        openai = new OpenAI({
          apiKey: apiKey,
        });
      }
      
      console.log('Starting OpenAI API call with GPT-4o');
      console.log('Document markdown length:', document.markdown.length);
      console.log('User message:', message);
      
      // Verify document content and log details
      let documentContent = document.markdown; // Use let instead of const to allow reassignment
      
      console.log(`Document ID: ${document.id}`);
      console.log(`Document title: ${document.title}`);
      console.log(`Document content length: ${document.content.length} characters`);
      console.log(`Document markdown length: ${documentContent.length} characters`);
      
      // Check if this is a CSV file (they tend to be very large)
      const fileType = document.title.split('.').pop()?.toLowerCase();
      const isCSV = fileType === 'csv';
      
      // Handle large documents - especially CSVs which can be massive
      if (documentContent.length > 30000 || isCSV) {
        console.log(`Document is very large (${documentContent.length} chars) or is a CSV file, implementing special handling`);
        
        // For CSV files, process in batches to analyze the entire dataset
        if (isCSV) {
          console.log('CSV file detected, processing in batches');
          
          // Extract headers and all rows
          const lines = documentContent.split('\n');
          const headers = lines[0];
          const dataRows = lines.slice(1);
          
          // Create a summary of the CSV structure
          const totalRows = dataRows.length;
          const columnCount = headers.split('|').length - 2; // Markdown table format has | at start and end
          
          // Determine how many batches we need (aim for ~5000 rows per batch to stay within token limits)
          const rowsPerBatch = 5000;
          const batchCount = Math.ceil(totalRows / rowsPerBatch);
          
          console.log(`Processing CSV with ${totalRows} rows in ${batchCount} batches`);
          
          // If the user's question is about analysis of the entire dataset or patterns
          const isAnalysisQuestion = message.toLowerCase().includes('categori') || 
                                   message.toLowerCase().includes('pattern') || 
                                   message.toLowerCase().includes('identif') || 
                                   message.toLowerCase().includes('analyz') || 
                                   message.toLowerCase().includes('analyse') || 
                                   message.toLowerCase().includes('summary') || 
                                   message.toLowerCase().includes('overview');
          
          if (isAnalysisQuestion) {
            // For analysis questions, we'll process a representative sample
            // Take rows from different parts of the file to get a representative sample
            const sampleSize = Math.min(500, totalRows);
            const step = Math.max(1, Math.floor(totalRows / sampleSize));
            
            const sampledRows = [];
            for (let i = 0; i < totalRows; i += step) {
              if (sampledRows.length < sampleSize) {
                sampledRows.push(dataRows[i]);
              } else {
                break;
              }
            }
            
            // Create a more manageable representation of the CSV
            documentContent = `# ${document.title}\n\n## CSV File Summary\n\n* **Total Rows**: ${totalRows}\n* **Total Columns**: ${columnCount}\n\n## Headers\n\n${headers}\n\n## Representative Sample Data (${sampledRows.length} rows from throughout the dataset)\n\n${headers}\n${sampledRows.join('\n')}\n\n## Analysis Instructions\n\nThis is a large CSV file with ${totalRows} rows. You're seeing a representative sample from throughout the dataset. Please analyze this sample to identify patterns, categorize data, and provide comprehensive insights about the entire dataset.`;
            
            console.log(`Created representative CSV sample with ${sampledRows.length} rows, length: ${documentContent.length} characters`);
          } else {
            // For specific questions, we'll search for relevant rows
            const keywords = message.toLowerCase().split(/\W+/).filter(w => w.length > 3);
            
            // Score rows by keyword relevance
            const relevantRows = dataRows
              .map(row => {
                const lowerRow = row.toLowerCase();
                const score = keywords.reduce((sum, kw) => sum + (lowerRow.includes(kw) ? 1 : 0), 0);
                return { text: row, score };
              })
              .filter(row => row.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 200) // Take top 200 most relevant rows
              .map(row => row.text);
            
            // If we found relevant rows, use them
            if (relevantRows.length > 0) {
              documentContent = `# ${document.title}\n\n## CSV File Summary\n\n* **Total Rows**: ${totalRows}\n* **Total Columns**: ${columnCount}\n\n## Headers\n\n${headers}\n\n## Relevant Data Rows (${relevantRows.length} rows matching your query)\n\n${headers}\n${relevantRows.join('\n')}\n\n## Query Instructions\n\nThis is a large CSV file with ${totalRows} rows. You're seeing the ${relevantRows.length} most relevant rows based on the query. Please answer the specific question about this data.`;
              
              console.log(`Created relevant CSV extract with ${relevantRows.length} rows, length: ${documentContent.length} characters`);
            } else {
              // If no relevant rows found, use a sample
              const sampleRows = dataRows.slice(0, 100).join('\n'); // Take first 100 rows
              
              documentContent = `# ${document.title}\n\n## CSV File Summary\n\n* **Total Rows**: ${totalRows}\n* **Total Columns**: ${columnCount}\n\n## Headers\n\n${headers}\n\n## Sample Data (first 100 rows)\n\n${headers}\n${sampleRows}\n\n## Query Instructions\n\nThis is a large CSV file with ${totalRows} rows. You're seeing the first 100 rows as a sample. Please answer the question based on this sample and indicate if more data would be needed.`;
              
              console.log(`Created CSV sample with 100 rows, length: ${documentContent.length} characters`);
            }
          }
        } 
        // For other large documents, use a more sophisticated chunking approach
        else {
          console.log('Large document detected, implementing advanced chunking');
          
          // Extract beginning (usually has important context)
          const beginning = documentContent.substring(0, 5000);
          
          // Extract sections that might match the query
          const keywords = message.toLowerCase().split(/\W+/).filter(w => w.length > 3);
          const paragraphs = documentContent.split('\n\n');
          
          // Score paragraphs by keyword relevance
          const relevantParagraphs = paragraphs
            .map(p => {
              const lowerP = p.toLowerCase();
              const score = keywords.reduce((sum, kw) => sum + (lowerP.includes(kw) ? 1 : 0), 0);
              return { text: p, score };
            })
            .filter(p => p.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20) // Take top 20 most relevant paragraphs
            .map(p => p.text)
            .join('\n\n');
          
          // If we found relevant paragraphs, use them
          if (relevantParagraphs.length > 0) {
            // Get the conclusion/end of the document too (often has important summaries)
            const ending = documentContent.substring(documentContent.length - 3000);
            
            // Combine sections
            documentContent = `# ${document.title}\n\n## DOCUMENT BEGINNING\n\n${beginning}\n\n## RELEVANT SECTIONS\n\n${relevantParagraphs}\n\n## DOCUMENT ENDING\n\n${ending}\n\n## ANALYSIS INSTRUCTIONS\n\nThis is a large document that has been strategically chunked. You're seeing the beginning, most relevant sections to the query, and the ending. Please analyze these sections to provide a comprehensive answer.`;
            
            console.log(`Created strategic document extract with length: ${documentContent.length} characters`);
          } else {
            // If no relevant paragraphs, take strategic sections from throughout the document
            const documentLength = documentContent.length;
            const chunkSize = 4000;
            const chunks = [];
            
            // Take chunks from beginning, 25%, 50%, 75%, and end of document
            chunks.push(documentContent.substring(0, chunkSize)); // Beginning
            chunks.push(documentContent.substring(Math.floor(documentLength * 0.25), Math.floor(documentLength * 0.25) + chunkSize)); // 25%
            chunks.push(documentContent.substring(Math.floor(documentLength * 0.5), Math.floor(documentLength * 0.5) + chunkSize)); // 50%
            chunks.push(documentContent.substring(Math.floor(documentLength * 0.75), Math.floor(documentLength * 0.75) + chunkSize)); // 75%
            chunks.push(documentContent.substring(documentLength - chunkSize)); // End
            
            documentContent = `# ${document.title}\n\n## DOCUMENT SECTIONS\n\n### Beginning\n${chunks[0]}\n\n### 25% Through Document\n${chunks[1]}\n\n### Middle of Document\n${chunks[2]}\n\n### 75% Through Document\n${chunks[3]}\n\n### End of Document\n${chunks[4]}\n\n## ANALYSIS INSTRUCTIONS\n\nThis is a large document that has been sampled at strategic points. You're seeing sections from the beginning, 25%, 50%, 75%, and end of the document. Please analyze these sections to provide a comprehensive answer.`;
            
            console.log(`Created strategic document sampling with length: ${documentContent.length} characters`);
          }
        }
      }
      
      // Add a check for document content
      if (documentContent.length < 100) {
        console.log('WARNING: Document markdown is suspiciously short, may indicate processing issue');
        console.log('First 100 chars of markdown:', documentContent.substring(0, 100));
        
        // If markdown is too short but we have content, use the raw content instead
        if (document.content.length > 100) {
          console.log('Using raw document content instead of markdown');
          const title = document.title.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
          const formattedContent = `# ${title}\n\n${document.content}`;
          console.log(`Formatted content length: ${formattedContent.length} characters`);
          // Use the formatted content instead
          documentContent = formattedContent;
        }
      }
      
      // Create a clear system prompt based on document type
      let systemPrompt = '';
      
      if (isCSV) {
        systemPrompt = `You are BlueEdge, an advanced AI assistant for the Conservative Research Department. 
        Your purpose is to analyze financial and data-heavy documents and provide factual, data-driven insights.
        
        This document is a large CSV file that has been summarized. You are seeing the headers and a sample of rows.
        
        FORMATTING REQUIREMENTS:
        - Present your analysis in clean, well-structured tables with clear headers
        - DO NOT use asterisks (*) for emphasis - use bold text with markdown (** **) instead
        - Use proper markdown tables with headers and aligned columns
        - Use numbered lists (1. 2. 3.) instead of bullet points for sequential items
        - Use headings (## and ###) to organize your response clearly
        - Keep your analysis concise and focused on the most important insights
        
        When analyzing financial data:
        1. Categorize expenditures by type, department, or purpose in a clear table
        2. Identify any unusual or potentially wasteful spending patterns
        3. Highlight the largest expenditure categories with specific amounts
        4. Note any politically sensitive spending that might require further scrutiny
        5. Provide a summary table with the key findings at the end
        
        Format your responses professionally with proper headings and tables.
        If you cannot answer a question based on the sample data provided, explain what specific information is missing.
        Be politically neutral in your analysis, focusing only on the facts presented in the document.`;
      } else {
        systemPrompt = `You are BlueEdge, an advanced AI assistant for the Conservative Research Department. 
        Your purpose is to analyze political documents and provide factual, data-driven insights.
        
        FORMATTING REQUIREMENTS:
        - Present your analysis in clean, well-structured format with clear headings
        - DO NOT use asterisks (*) for emphasis - use bold text with markdown (** **) instead
        - Use proper markdown tables with headers and aligned columns when presenting structured data
        - Use numbered lists (1. 2. 3.) instead of bullet points for sequential items
        - Use headings (## and ###) to organize your response clearly
        - Keep your analysis concise and focused on the most important insights
        
        When analyzing political documents:
        1. Identify the key arguments or positions presented
        2. Highlight important facts, figures, and statistics with proper formatting
        3. Summarize policy proposals or recommendations in a structured format
        4. Note any significant omissions or potential biases in the document
        5. Provide a concise summary of the most important points
        
        Always base your analysis solely on the document content provided.
        If the document doesn't contain information to answer a question, explain what specific information is missing.
        Be politically neutral in your analysis, focusing only on the facts presented in the document.`;
      }
      
      // Create the messages array for the chat completion with proper typing
      const messages = [
        { role: "system" as const, content: systemPrompt },
        { 
          role: "user" as const, 
          content: `I'm going to provide a political document for analysis, followed by a specific question about it.\n\n---DOCUMENT CONTENT---\n${documentContent}\n---END DOCUMENT CONTENT---\n\nQuestion: ${message}\n\nPlease provide a detailed analysis based on this document.` 
        }
      ];
      
      console.log('Using full document content with GPT-4o');
      
      // Call OpenAI API using the official SDK with GPT-4o
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o', // Using GPT-4o for advanced analysis
        messages: messages,
        temperature: 0.2, // Lower temperature for more factual responses
        max_tokens: 2000, // Allow for comprehensive responses
      });
      
      // Extract the response text
      const responseText = completion.choices[0].message.content || 'No response generated';
      
      // Save the assistant's response
      const assistantMessage = await prisma.message.create({
        data: {
          chatId: chat.id,
          role: 'assistant',
          content: responseText,
        },
      });

      return NextResponse.json({ response: responseText });
    } catch (openAIError: any) {
      console.error('Error with OpenAI API:', openAIError);
      
      // Detailed error logging
      if (openAIError.response) {
        console.error('OpenAI API response error:', openAIError.response);
      }
      
      // Provide a helpful error message based on the error type
      let errorMessage = 'Error analyzing document';
      
      if (openAIError.code === 'context_length_exceeded') {
        errorMessage = 'The document is too large for analysis. Please try a smaller document or a more specific question.';
      } else if (openAIError.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again in a few moments.';
      } else if (openAIError.status === 401) {
        errorMessage = 'Invalid API key. Please check your OpenAI API configuration.';
      } else if (openAIError.message) {
        errorMessage = `OpenAI API error: ${openAIError.message}`;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error processing chat:', error);
    return NextResponse.json(
      { error: 'Error processing chat request' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    // Retrieve chats for this document with their messages
    const chats = await prisma.chat.findMany({
      where: { documentId },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ chats });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return NextResponse.json(
      { error: 'Error fetching chat history' },
      { status: 500 }
    );
  }
} 