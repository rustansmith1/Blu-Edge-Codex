import { Document as LangChainDocument } from 'langchain/document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAI } from 'langchain/llms/openai';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

/**
 * Converts a document to markdown format based on its file type
 * Enhanced to create better structured markdown for analysis
 */
export async function convertToMarkdown(file: File, content: string): Promise<string> {
  const fileType = file.name.split('.').pop()?.toLowerCase();
  
  // Extract document title from filename, removing extension and formatting
  let title = file.name;
  // Remove file extension
  title = title.replace(/\.[^/.]+$/, '');
  // Replace underscores and hyphens with spaces
  title = title.replace(/[_-]/g, ' ');
  // Capitalize first letter of each word
  title = title.replace(/\b\w/g, l => l.toUpperCase());
  
  // Format the content based on file type
  let formattedContent = '';
  
  switch (fileType) {
    case 'pdf':
      // Format PDF content with better structure
      formattedContent = formatTextContent(content, title);
      break;
    
    case 'doc':
    case 'docx':
      // For Word documents, we've already extracted the text content properly
      // Just need to format it nicely for analysis
      console.log('Formatting Word document content for analysis');
      formattedContent = formatTextContent(content, title);
      
      // Add a note about the document type
      formattedContent = `# ${title}\n\n> Document Type: Microsoft Word Document\n\n${formattedContent.substring(formattedContent.indexOf('\n\n') + 2)}`;
      break;
    
    case 'txt':
      // Format plain text with better structure
      formattedContent = formatTextContent(content, title);
      break;
    
    case 'csv':
      // Convert CSV to markdown table
      formattedContent = convertCsvToMarkdown(content);
      break;
    
    case 'ods':
      // For OpenDocument Spreadsheet files
      console.log('Formatting ODS document content for analysis');
      // The content should already be in CSV format from the processing step
      // Convert each sheet's CSV data to markdown tables
      formattedContent = `# ${title}\n\n> Document Type: OpenDocument Spreadsheet\n\n`;
      
      // Split by sheet headers
      const sheets = content.split('## Sheet:');
      
      // Process each sheet (skip the first empty element if it exists)
      for (let i = 1; i < sheets.length; i++) {
        const sheetContent = sheets[i].trim();
        const sheetNameEnd = sheetContent.indexOf('\n');
        const sheetName = sheetContent.substring(0, sheetNameEnd).trim();
        const sheetData = sheetContent.substring(sheetNameEnd).trim();
        
        // Convert the sheet's CSV data to a markdown table
        const sheetMarkdown = convertCsvToMarkdown(sheetData);
        
        // Add to the formatted content
        formattedContent += `## Sheet: ${sheetName}\n\n${sheetMarkdown}\n\n`;
      }
      break;
    
    case 'xls':
    case 'xlsx':
      // For Excel files - similar to ODS handling
      console.log('Formatting Excel document content for analysis');
      formattedContent = `# ${title}\n\n> Document Type: Excel Spreadsheet\n\n`;
      
      // Split by sheet headers
      const excelSheets = content.split('## Sheet:');
      
      // Process each sheet (skip the first empty element if it exists)
      for (let i = 1; i < excelSheets.length; i++) {
        const sheetContent = excelSheets[i].trim();
        const sheetNameEnd = sheetContent.indexOf('\n');
        const sheetName = sheetContent.substring(0, sheetNameEnd).trim();
        const sheetData = sheetContent.substring(sheetNameEnd).trim();
        
        // Convert the sheet's CSV data to a markdown table
        const sheetMarkdown = convertCsvToMarkdown(sheetData);
        
        // Add to the formatted content
        formattedContent += `## Sheet: ${sheetName}\n\n${sheetMarkdown}\n\n`;
      }
      break;
    
    default:
      formattedContent = formatTextContent(content, title);
  }
  
  return formattedContent;
}

/**
 * Helper function to format text content with better structure
 */
function formatTextContent(content: string, title: string): string {
  // Split content into paragraphs
  const paragraphs = content.split(/\n\s*\n/);
  
  // Start with the title
  let markdown = `# ${title}\n\n`;
  
  // Process paragraphs to identify potential headers and structure
  let inList = false;
  
  paragraphs.forEach((paragraph, index) => {
    // Skip empty paragraphs
    if (!paragraph.trim()) return;
    
    // Check if paragraph looks like a heading (short, ends with colon, or all caps)
    const trimmedPara = paragraph.trim();
    const words = trimmedPara.split(/\s+/);
    
    if (
      // Potential heading: short (1-5 words) and either ends with colon or all uppercase
      (words.length <= 5 && (trimmedPara.endsWith(':') || trimmedPara === trimmedPara.toUpperCase())) ||
      // Or starts with common heading words
      /^(summary|introduction|conclusion|overview|background|methodology|results|findings|recommendations|appendix|section)/i.test(trimmedPara)
    ) {
      // Format as a heading, remove trailing colon if present
      const headingText = trimmedPara.endsWith(':') ? trimmedPara.slice(0, -1) : trimmedPara;
      markdown += `\n## ${headingText}\n\n`;
      inList = false;
    } 
    // Check if this looks like a list item
    else if (trimmedPara.match(/^[\*\-\d\.\)\]]+\s/) || 
             (inList && trimmedPara.length < 200)) {
      // Continue or start a list
      if (!inList) markdown += '\n';
      markdown += `${trimmedPara}\n`;
      inList = true;
    }
    // Regular paragraph
    else {
      markdown += `${trimmedPara}\n\n`;
      inList = false;
    }
  });
  
  return markdown;
}

/**
 * Extracts metadata from a document using content analysis
 */
export async function extractMetadata(file: File, content: string, markdown: string): Promise<any> {
  const fileType = file.name.split('.').pop()?.toLowerCase();
  const wordCount = content.split(/\s+/).length;
  const characterCount = content.length;
  
  // Extract document title from filename, removing extension and formatting
  let title = file.name;
  // Remove file extension
  title = title.replace(/\.[^/.]+$/, '');
  // Replace underscores and hyphens with spaces
  title = title.replace(/[_-]/g, ' ');
  // Capitalize first letter of each word
  title = title.replace(/\b\w/g, l => l.toUpperCase());
  
  // Generate a better summary by extracting the first paragraph that's at least 100 chars
  let summary = '';
  const paragraphs = content.split('\n\n');
  for (const para of paragraphs) {
    const cleaned = para.trim();
    if (cleaned.length >= 100) {
      summary = cleaned.substring(0, 250);
      if (cleaned.length > 250) summary += '...';
      break;
    }
  }
  
  // If no good paragraph was found, use the first 250 chars
  if (!summary && content.length > 0) {
    summary = content.substring(0, 250);
    if (content.length > 250) summary += '...';
  }
  
  // Extract key topics with improved algorithm
  const words = content.toLowerCase().split(/\W+/);
  const stopWords = [
    'the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'as',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'that', 'which', 'this',
    'these', 'those', 'then', 'than', 'when', 'where', 'why', 'how', 'all', 'any', 'both',
    'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now'
  ];
  
  // Create word frequency map
  const wordFrequency: Record<string, number> = {};
  words.forEach(word => {
    if (word.length > 3 && !stopWords.includes(word)) {
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    }
  });
  
  // Get top 8 most frequent words as topics
  const topics = Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(entry => entry[0]);
  
  // Try to identify document type based on content
  let documentType = 'General Document';
  const contentLower = content.toLowerCase();
  
  if (contentLower.includes('policy') || contentLower.includes('policies')) {
    documentType = 'Policy Document';
  } else if (contentLower.includes('report') || contentLower.includes('analysis')) {
    documentType = 'Analysis Report';
  } else if (contentLower.includes('briefing') || contentLower.includes('brief')) {
    documentType = 'Briefing Document';
  } else if (contentLower.includes('speech') || contentLower.includes('address')) {
    documentType = 'Speech';
  } else if (contentLower.includes('minutes') || contentLower.includes('meeting')) {
    documentType = 'Meeting Minutes';
  } else if (contentLower.includes('data') || contentLower.includes('statistics')) {
    documentType = 'Data Report';
  }
  
  // Try to extract date from content
  let date = null;
  const dateRegex = /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?[,\s]+(\d{4})\b/i;
  const dateMatch = content.match(dateRegex);
  if (dateMatch) {
    date = dateMatch[0];
  }
  
  return {
    title,
    fileType,
    wordCount,
    characterCount,
    summary,
    topics,
    documentType,
    date,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Splits a document into chunks for processing with LangChain
 */
export async function splitDocumentIntoChunks(content: string) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  
  return await splitter.createDocuments([content]);
}

/**
 * Helper function to convert CSV content to markdown table
 */
function convertCsvToMarkdown(csvContent: string): string {
  const lines = csvContent.trim().split('\n');
  if (lines.length === 0) return '';
  
  const headers = lines[0].split(',');
  let markdown = '# CSV Data\n\n';
  
  // Create table header
  markdown += '| ' + headers.join(' | ') + ' |\n';
  markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
  
  // Create table rows
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    markdown += '| ' + values.join(' | ') + ' |\n';
  }
  
  return markdown;
}

/**
 * Function to extract metadata from document content
 */
export async function extractDocumentMetadata(content: string, fileName: string): Promise<any> {
  try {
    const model = new OpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      temperature: 0,
    });
    
    const response = await model.call(
      `Extract key metadata from the following document. 
      Return a JSON object with the following fields:
      - title: The document title
      - date: The document date (if available)
      - author: The document author (if available)
      - summary: A brief summary of the document content (2-3 sentences)
      
      Document name: ${fileName}
      Document content:
      ${content.substring(0, 3000)}` // Limit content to avoid token limits
    );
    
    try {
      // Try to parse the response as JSON
      return JSON.parse(response);
    } catch (e) {
      // If parsing fails, return a simple object
      return {
        title: fileName,
        summary: response,
      };
    }
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return {
      title: fileName,
      summary: 'No summary available',
    };
  }
}
