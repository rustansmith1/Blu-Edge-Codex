import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAI } from '@langchain/openai';
import { RetrievalQAChain, loadQAStuffChain } from 'langchain/chains';
import { PrismaClient } from '@prisma/client';

// Initialize OpenAI embeddings with API key
const getEmbeddings = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  return new OpenAIEmbeddings({ openAIApiKey: apiKey });
};

// Text splitter for chunking documents
const getTextSplitter = () => {
  return new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
};

// Create vector store from documents
export const createVectorStore = async (documents: { id: string; content: string; title: string }[]) => {
  try {
    const embeddings = getEmbeddings();
    const textSplitter = getTextSplitter();
    
    // Process each document and create chunks with metadata
    const docs = [];
    for (const doc of documents) {
      const textChunks = await textSplitter.splitText(doc.content);
      
      // Create LangChain documents with metadata
      const langChainDocs = textChunks.map((chunk, i) => 
        new Document({
          pageContent: chunk,
          metadata: {
            documentId: doc.id,
            documentTitle: doc.title,
            chunkIndex: i,
            source: doc.title,
          },
        })
      );
      
      docs.push(...langChainDocs);
    }
    
    // Create in-memory vector store
    const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
    
    return vectorStore;
  } catch (error) {
    console.error('Error creating vector store:', error);
    throw error;
  }
};

// Semantic search across documents
export const semanticSearch = async (
  vectorStore: MemoryVectorStore,
  query: string,
  limit: number = 5
) => {
  try {
    const results = await vectorStore.similaritySearch(query, limit);
    
    // Format results with document info
    return results.map(result => ({
      content: result.pageContent,
      documentId: result.metadata.documentId,
      documentTitle: result.metadata.documentTitle,
      score: result.metadata.score,
    }));
  } catch (error) {
    console.error('Error performing semantic search:', error);
    throw error;
  }
};

// Multi-document RAG
export const multiDocumentRAG = async (
  vectorStore: MemoryVectorStore,
  query: string,
  limit: number = 10
) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }
    
    // Initialize OpenAI model
    const model = new OpenAI({
      openAIApiKey: apiKey,
      modelName: 'gpt-4o',
      temperature: 0.2,
    });
    
    // Create retrieval chain
    const chain = new RetrievalQAChain({
      combineDocumentsChain: loadQAStuffChain(model),
      retriever: vectorStore.asRetriever(limit),
    });
    
    // Execute the chain
    const response = await chain.call({
      query,
    });
    
    return response.text;
  } catch (error) {
    console.error('Error performing multi-document RAG:', error);
    throw error;
  }
};
