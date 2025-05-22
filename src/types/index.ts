import { Document as PrismaDocument, Chat as PrismaChat, Message as PrismaMessage } from '@prisma/client';

// Extend the Document type to include metadata
export interface Document extends PrismaDocument {
  metadata?: string | null;
}

export interface Chat extends PrismaChat {
  messages?: Message[];
  document?: Document;
}

export interface Message extends PrismaMessage {
  chat?: Chat;
}

// Type for document metadata
export interface DocumentMetadata {
  title?: string;
  date?: string;
  author?: string;
  summary?: string;
  [key: string]: any;
}
