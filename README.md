# BlueEdge - Political Research Platform

BlueEdge is a modern document analysis platform built for the Conservative Research Department. It allows users to upload documents and data, converts them to markdown, and provides an AI-powered chat interface for document analysis.

## Features

- **Document Upload**: Upload various document formats (PDF, DOC, DOCX, TXT, CSV, XLS, XLSX)
- **Markdown Conversion**: Automatically converts documents to markdown for better analysis
- **AI-Powered Analysis**: Uses LangChain and OpenAI to provide intelligent document analysis
- **Interactive Chat**: Ask questions about your documents and get detailed answers
- **Document Management**: Organize and manage your research documents
- **Metadata Extraction**: Automatically extracts key information from documents

## Getting Started

### Prerequisites

- Node.js (v16 or later)
- npm or yarn
- OpenAI API key

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up your environment variables:
   - Create a `.env.local` file in the root directory
   - Add your OpenAI API key: `OPENAI_API_KEY=your_api_key_here`

4. Initialize the database:
   ```
   npx prisma migrate dev
   ```

5. Start the development server:
   ```
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Upload a Document**: Drag and drop a file or click to select a file
2. **View Document**: Select a document to view its content
3. **Ask Questions**: Use the chat interface to ask questions about the document
4. **Get Analysis**: Receive detailed analysis based on the document content

## Technology Stack

- **Frontend**: Next.js, React, TailwindCSS
- **Backend**: Next.js API Routes
- **Database**: Prisma with SQLite (can be configured for other databases)
- **AI**: LangChain, OpenAI
- **Document Processing**: Custom utilities for document conversion

## License

This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

© 2025 Conservative Research Department. All rights reserved.
