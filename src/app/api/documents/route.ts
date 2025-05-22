import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { convertToMarkdown, extractMetadata } from '@/utils/documentProcessing';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`Processing file upload: ${file.name}, size: ${file.size} bytes`);

    // Read file as buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Check file type
    const fileType = file.name.split('.').pop()?.toLowerCase();
    let content = '';
    
    // Process based on file type
    if (fileType === 'docx' || fileType === 'doc') {
      // @ts-ignore - Ignore TypeScript errors related to mammoth
      console.log('Processing Word document...');
      try {
        // Extract text using mammoth
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
        console.log(`Word document processed, extracted ${content.length} characters`);
      } catch (error) {
        console.error('Error processing Word document:', error);
        // Fallback to buffer toString if mammoth fails
        content = buffer.toString();
        console.log('Falling back to buffer.toString() for Word document');
      }
    } else if (fileType === 'ods' || fileType === 'xlsx' || fileType === 'xls') {
      console.log(`Processing spreadsheet (${fileType}) document...`);
      try {
        // Parse spreadsheet using xlsx library
        const workbook = XLSX.read(buffer);
        
        // Convert to CSV format first
        let csvContent = '';
        
        // Process each sheet
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const sheetData = XLSX.utils.sheet_to_csv(sheet);
          
          // Add sheet name as header and append data
          csvContent += `\n## Sheet: ${sheetName}\n\n${sheetData}\n\n`;
        }
        
        content = csvContent;
        console.log(`Spreadsheet processed, extracted ${content.length} characters from ${workbook.SheetNames.length} sheets`);
      } catch (error) {
        console.error(`Error processing ${fileType} file:`, error);
        // Fallback to buffer toString
        content = buffer.toString();
        console.log(`Falling back to buffer.toString() for ${fileType} file`);
      }
    } else {
      // For other file types, use buffer.toString()
      content = buffer.toString();
      console.log(`File content extracted, length: ${content.length} characters`);
    }
    
    if (content.length === 0) {
      return NextResponse.json({ error: 'File appears to be empty or could not be processed' }, { status: 400 });
    }

    // Convert to markdown and extract metadata
    console.log('Converting to markdown...');
    const markdown = await convertToMarkdown(file, content);
    console.log(`Markdown generated, length: ${markdown.length} characters`);

    console.log('Extracting metadata...');
    const metadata = await extractMetadata(file, content);

    // Save document to database
    console.log('Saving document to database...');
    const document = await prisma.document.create({
      data: {
        title: file.name,
        content,
        markdown,
        metadata: metadata as any,
        folder: 'Unclassified', // Default folder for new documents
      } as any, // Type assertion to avoid TypeScript errors with the new schema
    });

    console.log(`Document saved successfully with ID: ${document.id}`);
    console.log(`Markdown content length in database: ${document.markdown.length} characters`);

    return NextResponse.json({ document });
  } catch (error) {
    console.error('Error processing document:', error);
    return NextResponse.json({ error: 'Failed to process document' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }
    
    console.log(`Attempting to delete document with ID: ${id}`);
    
    // First check if document exists
    const document = await prisma.document.findUnique({
      where: { id },
      include: { chats: { include: { messages: true } } } // Include related chats and messages
    });
    
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    
    // Delete related chats and messages first to avoid foreign key constraints
    if (document.chats && document.chats.length > 0) {
      console.log(`Deleting ${document.chats.length} related chats`);
      
      // Delete messages for each chat
      for (const chat of document.chats) {
        await prisma.message.deleteMany({
          where: { chatId: chat.id }
        });
      }
      
      // Delete chats
      await prisma.chat.deleteMany({
        where: { documentId: id }
      });
    }
    
    // Now delete the document
    await prisma.document.delete({
      where: { id }
    });
    
    console.log(`Document ${id} deleted successfully`);
    
    return NextResponse.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json({ error: 'Failed to delete document: ' + (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const folder = searchParams.get('folder');
    
    if (!id || !folder) {
      return NextResponse.json({ error: 'Document ID and folder are required' }, { status: 400 });
    }
    
    const document = await prisma.document.findUnique({
      where: { id },
    });
    
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    
    await prisma.document.update({
      where: { id },
      data: { folder } as any, // Type assertion to avoid TypeScript errors with the new schema
    });
    
    return NextResponse.json({ message: 'Document folder updated successfully' });
  } catch (error) {
    console.error('Error updating document folder:', error);
    return NextResponse.json({ error: 'Failed to update document folder' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    // If ID is provided, return a single document
    if (id) {
      const document = await prisma.document.findUnique({
        where: { id },
      });
      
      if (!document) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      
      return NextResponse.json({ document });
    }
    
    // Otherwise return all documents
    const documents = await prisma.document.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}