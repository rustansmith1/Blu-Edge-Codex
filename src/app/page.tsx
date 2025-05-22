'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import GeminiAnalysis from './components/GeminiAnalysis';

type Document = {
  id: string;
  title: string;
  content: string;
  markdown: string;
  metadata?: any;
  createdAt: string;
  folder?: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export default function Home() {
  const [activeTab, setActiveTab] = useState('upload');
  // Semantic search and RAG states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ragQuery, setRagQuery] = useState('');
  const [ragResponse, setRagResponse] = useState('');
  const [isRagLoading, setIsRagLoading] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocument, setActiveDocument] = useState<Document | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Folder management
  const [folders, setFolders] = useState<string[]>(['Unclassified', 'Policy', 'Research', 'Speeches', 'Data']);
  const [activeFolder, setActiveFolder] = useState<string>('All');
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [documentToEdit, setDocumentToEdit] = useState<Document | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);

  // Fetch documents on component mount
  useEffect(() => {
    fetchDocuments();
  }, []);

  // Fetch chat history when active document changes
  useEffect(() => {
    if (activeDocument) {
      fetchChatHistory(activeDocument.id);
      setActiveTab('chat');
    }
  }, [activeDocument]);

  const fetchDocuments = async () => {
    try {
      const response = await axios.get('/api/documents');
      setDocuments(response.data.documents || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      setError('Failed to load documents');
    }
  };

  const fetchChatHistory = async (documentId: string) => {
    try {
      const response = await axios.get(`/api/chat?documentId=${documentId}`);
      if (response.data.chats && response.data.chats.length > 0) {
        // Get the most recent chat
        const latestChat = response.data.chats[0];
        setChatMessages(latestChat.messages || []);
      } else {
        setChatMessages([]);
      }
    } catch (error) {
      console.error('Error fetching chat history:', error);
      setError('Failed to load chat history');
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    
    setIsUploading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post('/api/documents', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      // Add the new document to the list and set it as active
      if (response.data.document) {
        setDocuments(prev => [response.data.document, ...prev]);
        setActiveDocument(response.data.document);
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      setError('Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || !activeDocument) return;

    // Add user message to chat
    const newUserMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: userInput,
      createdAt: new Date().toISOString(),
    };
    
    setChatMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsLoading(true);
    setError(null);
    
    // Scroll to bottom of chat
    setTimeout(() => {
      const chatContainer = document.querySelector('.chat-container');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 100);

    try {
      // Send message to API
      const response = await axios.post('/api/chat', {
        documentId: activeDocument.id,
        message: userInput,
      });

      // Add assistant response to chat
      if (response.data.response) {
        const assistantMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant' as const,
          content: response.data.response,
          createdAt: new Date().toISOString(),
        };
        
        setChatMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to get a response');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle document deletion
  const handleDeleteDocument = async (document: Document) => {
    setDocumentToDelete(document);
    setShowDeleteModal(true);
  };

  const confirmDeleteDocument = async () => {
    if (!documentToDelete) return;
    
    try {
      setError(null);
      console.log(`Deleting document with ID: ${documentToDelete.id}`);
      
      const response = await axios.delete(`/api/documents?id=${documentToDelete.id}`);
      console.log('Delete response:', response.data);
      
      // Remove from documents list
      setDocuments(prev => prev.filter(doc => doc.id !== documentToDelete.id));
      
      // If active document is deleted, clear it
      if (activeDocument && activeDocument.id === documentToDelete.id) {
        setActiveDocument(null);
        setChatMessages([]);
        setActiveTab('upload'); // Switch back to document library
      }
      
      setShowDeleteModal(false);
      setDocumentToDelete(null);
    } catch (error) {
      console.error('Error deleting document:', error);
      if (axios.isAxiosError(error) && error.response) {
        setError(`Failed to delete document: ${error.response.data.error || error.message}`);
      } else {
        setError(`Failed to delete document: ${(error as Error).message}`);
      }
      setShowDeleteModal(false);
    }
  };

  // Handle folder management
  const handleAddFolder = () => {
    if (newFolderName.trim() === '') return;
    
    // Add new folder if it doesn't already exist
    if (!folders.includes(newFolderName.trim())) {
      setFolders(prev => [...prev, newFolderName.trim()]);
    }
    
    setNewFolderName('');
    setShowFolderModal(false);
  };

  const handleMoveToFolder = async (document: Document, folder: string) => {
    try {
      // Update document with new folder
      const updatedDoc = { ...document, folder };
      
      // Call API to update document (we'll implement this endpoint later)
      await axios.put(`/api/documents`, {
        id: document.id,
        folder
      });
      
      // Update documents list
      setDocuments(prev => prev.map(doc => 
        doc.id === document.id ? { ...doc, folder } : doc
      ));
      
      // If this is the active document, update it too
      if (activeDocument && activeDocument.id === document.id) {
        setActiveDocument(updatedDoc);
      }
    } catch (error) {
      console.error('Error updating document folder:', error);
      setError('Failed to update document folder');
    }
  };

  const getFilteredDocuments = () => {
    if (activeFolder === 'All') {
      return documents;
    }
    
    return documents.filter(doc => 
      activeFolder === 'Unclassified' 
        ? !doc.folder || doc.folder === 'Unclassified'
        : doc.folder === activeFolder
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  // Semantic search function
  const handleSemanticSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchResults([]);
    setError(null);
    
    try {
      const response = await axios.get(`/api/search?query=${encodeURIComponent(searchQuery)}`);
      setSearchResults(response.data.results || []);
    } catch (error: any) {
      console.error('Error performing semantic search:', error);
      setError(error.response?.data?.error || 'Failed to perform semantic search');
    } finally {
      setIsSearching(false);
    }
  };

  // Multi-document RAG function
  const handleMultiDocumentRAG = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragQuery.trim()) return;
    
    setIsRagLoading(true);
    setRagResponse('');
    setError(null);
    
    // Check if query is related to data analysis
    const isAnalysisQuery = [
      'average', 'calculate', 'comparison', 'compare', 'analysis',
      'council tax', 'political control', 'labour', 'conservative',
      'increase', 'percentage', 'statistics', 'data'
    ].some(keyword => ragQuery.toLowerCase().includes(keyword.toLowerCase()));
    
    try {
      // Use Gemini for analysis queries to handle larger context
      const endpoint = isAnalysisQuery ? '/api/gemini' : '/api/rag';
      
      const response = await axios.post(endpoint, {
        query: ragQuery,
        limit: isAnalysisQuery ? 20 : 10, // Increase limit for analysis queries to get more context
        performAnalysis: isAnalysisQuery
      });
      
      // Format the response with analysis results if available
      let formattedResponse = '';
      
      if (endpoint === '/api/gemini') {
        formattedResponse = response.data.response || '';
        // Add a note about using Gemini for comprehensive analysis
        formattedResponse += '\n\n---\n\n**Note:** This analysis was performed using Gemini with full document context, allowing for comprehensive analysis without truncation.\n';
      } else {
        formattedResponse = response.data.response || '';
        
        // If we have analysis results from OpenAI, add them to the response
        if (response.data.analysisResults && response.data.analysisResults.length > 0) {
          // Add a note about the analysis
          formattedResponse += '\n\n---\n\n**Note:** This analysis was performed using all available data, not just sample data.\n';
          
          // Add information about the methodology if available
          const methodologies = response.data.analysisResults
            .filter((result: any) => result.methodology)
            .map((result: any) => `- ${result.type}: ${result.methodology}`)
            .join('\n');
          
          if (methodologies) {
            formattedResponse += '\n**Methodology:**\n' + methodologies;
          }
        }
      }
      
      setRagResponse(formattedResponse);
    } catch (error: any) {
      console.error('Error performing multi-document RAG:', error);
      setError(error.response?.data?.error || 'Failed to perform multi-document analysis');
    } finally {
      setIsRagLoading(false);
    }
  };

  // Process all documents for vector search
  const processDocumentsForSearch = async () => {
    setShowProcessingModal(true);
    setProcessingStatus('Processing documents for vector search...');
    
    try {
      const response = await axios.post('/api/search', {
        action: 'process_all',
      });
      
      setProcessingStatus(`Success! ${response.data.processedCount} documents processed.`);
      
      // Close modal after 2 seconds
      setTimeout(() => {
        setShowProcessingModal(false);
      }, 2000);
    } catch (error: any) {
      console.error('Error processing documents:', error);
      setProcessingStatus(`Error: ${error.response?.data?.error || 'Failed to process documents'}`);
      
      // Close modal after 3 seconds
      setTimeout(() => {
        setShowProcessingModal(false);
      }, 3000);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 min-h-screen">
      <div className="bg-gray-900 shadow-xl rounded-lg overflow-hidden border border-gray-800">
        <div className="bg-gray-800 px-6 py-5 border-b border-gray-700 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 h-8 w-8 rounded flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 01-.659 1.591L9.5 14.5m3.25-11.396c.251.023.501.05.75.082m-1.5-.082a24.301 24.301 0 00-4.5 0m12 0v5.714a2.25 2.25 0 01-.659 1.591L17.5 14.5m-3.25-11.396c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-blue-400">BlueEdge</h1>
          </div>
          <div className="text-sm text-gray-400 font-medium">Conservative Research Department</div>
        </div>
        
        <div className="flex bg-gray-800 border-b border-gray-700 overflow-x-auto">
          <button 
            className={`py-4 px-8 font-medium text-sm tracking-wide transition-colors ${activeTab === 'upload' ? 'bg-gray-900 text-blue-400 border-b-2 border-blue-500' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
            onClick={() => setActiveTab('upload')}
          >
            DOCUMENT LIBRARY
          </button>
          <button 
            className={`py-4 px-8 font-medium text-sm tracking-wide transition-colors ${activeTab === 'chat' ? 'bg-gray-900 text-blue-400 border-b-2 border-blue-500' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
            onClick={() => setActiveTab('chat')}
            disabled={!activeDocument}
          >
            ANALYSIS CONSOLE
          </button>
          <button 
            className={`py-4 px-8 font-medium text-sm tracking-wide transition-colors ${activeTab === 'search' ? 'bg-gray-900 text-blue-400 border-b-2 border-blue-500' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
            onClick={() => setActiveTab('search')}
          >
            SEMANTIC SEARCH
          </button>
          <button 
            className={`py-4 px-8 font-medium text-sm tracking-wide transition-colors ${activeTab === 'rag' ? 'bg-gray-900 text-blue-400 border-b-2 border-blue-500' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
            onClick={() => setActiveTab('rag')}
          >
            MULTI-DOCUMENT ANALYSIS
          </button>
        </div>
        
        <div className="p-6">
          {error && (
            <div className="bg-red-900/30 text-red-400 p-4 rounded-md mb-4 text-sm border border-red-800">
              <div className="flex items-start">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-medium">{error.includes('OpenAI API key') ? 'API Key Not Configured' : 'Error'}</p>
                  <p className="mt-1">{error}</p>
                  {error.includes('OpenAI API key') && (
                    <div className="mt-3 text-xs">
                      <p>To fix this issue:</p>
                      <ol className="list-decimal ml-4 mt-1 space-y-1">
                        <li>Get an API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">OpenAI's platform</a></li>
                        <li>Add it to the <code className="bg-gray-800 px-1 py-0.5 rounded">.env.local</code> file</li>
                        <li>Restart the development server</li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'upload' ? (
            <div className="upload-section">
              <div 
                className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-all"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ods';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleFileUpload(file);
                  };
                  input.click();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileUpload(file);
                }}
              >
                {isUploading ? (
                  <div className="py-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-400">Uploading document...</p>
                  </div>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="mt-4 text-gray-400 text-lg">Drag and drop files here, or click to select files</p>
                    <p className="text-sm text-gray-500 mt-2">Supports PDF, DOC, DOCX, TXT, CSV, XLS, XLSX, ODS</p>
                  </>
                )}
              </div>
              
              <div className="mt-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-semibold text-blue-400 tracking-tight">Document Library</h2>
                  <div className="flex items-center space-x-3">
                    <div className="text-xs text-gray-500">{documents.length} document{documents.length !== 1 ? 's' : ''}</div>
                    <button 
                      onClick={() => setShowFolderModal(true)}
                      className="text-xs bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 px-2.5 py-1 rounded flex items-center transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      New Folder
                    </button>
                  </div>
                </div>
                
                {/* Folder Navigation */}
                <div className="mb-6 flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                  <button
                    onClick={() => setActiveFolder('All')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${activeFolder === 'All' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    All Documents
                  </button>
                  
                  {folders.map(folder => (
                    <button
                      key={folder}
                      onClick={() => setActiveFolder(folder)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center ${activeFolder === folder ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      {folder}
                    </button>
                  ))}
                </div>
                
                {getFilteredDocuments().length === 0 ? (
                  <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {documents.length === 0 ? (
                      <>
                        <p className="text-gray-400 font-medium">No documents in your library</p>
                        <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">Upload a document using the interface above to begin your analysis</p>
                      </>
                    ) : (
                      <>
                        <p className="text-gray-400 font-medium">No documents in this folder</p>
                        <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">Select a different folder or upload new documents</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {getFilteredDocuments().map((doc) => (
                      <div 
                        key={doc.id}
                        className="document-card rounded-lg p-5 hover:shadow-lg transition-all group border border-transparent hover:border-blue-500/30 bg-gray-800/40"
                      >
                        <div className="flex items-start">
                          <div 
                            className="p-2.5 rounded-md bg-blue-900/30 mr-3.5 group-hover:bg-blue-800/50 transition-colors cursor-pointer"
                            onClick={() => setActiveDocument(doc)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400 group-hover:text-blue-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between">
                              <h3 
                                className="font-medium text-gray-200 truncate max-w-[200px] group-hover:text-white transition-colors cursor-pointer" 
                                onClick={() => setActiveDocument(doc)}
                                title={doc.title} // Add tooltip for full title on hover
                              >
                                {doc.title}
                              </h3>
                              <div className="dropdown relative ml-2">
                                <button className="text-gray-500 hover:text-gray-300 p-1 rounded-md hover:bg-gray-700/50 transition-colors">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                  </svg>
                                </button>
                                <div className="dropdown-menu absolute right-0 mt-1 w-48 bg-gray-800 rounded-md shadow-lg border border-gray-700 z-10 hidden group-hover:block">
                                  <div className="py-1">
                                    <button 
                                      onClick={() => setActiveDocument(doc)}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      Analyze Document
                                    </button>
                                    
                                    <div className="relative">
                                      <button 
                                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center justify-between group"
                                      >
                                        <div className="flex items-center">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                          </svg>
                                          Move to Folder
                                        </div>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>
                                      <div className="absolute left-full top-0 ml-1 w-48 bg-gray-800 rounded-md shadow-lg border border-gray-700 hidden group-hover:block">
                                        {folders.map(folder => (
                                          <button 
                                            key={folder}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleMoveToFolder(doc, folder);
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center"
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                            </svg>
                                            {folder}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteDocument(doc);
                                      }}
                                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 flex items-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                      Delete Document
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                              <p className="text-xs text-gray-500 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {formatDate(doc.createdAt)}
                              </p>
                              {doc.folder && (
                                <span className="text-xs px-2 py-0.5 bg-blue-900/30 text-blue-300 rounded-md flex items-center">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                  </svg>
                                  {doc.folder}
                                </span>
                              )}
                            </div>
                            {doc.metadata && doc.metadata.topics && doc.metadata.topics.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-3">
                                {doc.metadata.topics.slice(0, 3).map((topic, i) => (
                                  <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-700/70 text-gray-300 rounded">{topic}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'search' ? (
            <div className="search-section">
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-blue-400 tracking-tight mb-4">Semantic Search</h2>
                <p className="text-gray-400 mb-6">Search across all documents using natural language. Find conceptually similar content even when exact keywords don't match.</p>
                
                <div className="flex items-center mb-4">
                  <div className="flex space-x-3">
                    <button
                      onClick={processDocumentsForSearch}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Process Documents
                    </button>
                    
                    {(searchResults.length > 0 || searchQuery.trim() || processingStatus) && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults([]);
                          setProcessingStatus('');
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Clear All
                      </button>
                    )}
                  </div>
                  <div className="ml-4 text-xs text-gray-500">{documents.length} document{documents.length !== 1 ? 's' : ''} available for search</div>
                </div>
                
                <form onSubmit={handleSemanticSearch} className="relative">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search across all documents..."
                      className="w-full bg-gray-800 text-gray-200 rounded-lg pl-10 pr-4 py-3 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                    />
                    <div className="absolute left-3 top-3.5 text-gray-500">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="absolute right-2 top-2 flex space-x-2">
                    {searchResults.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                        className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSearching || !searchQuery.trim()}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isSearching || !searchQuery.trim() ? 'bg-blue-900/50 text-blue-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                    >
                      {isSearching ? 'Searching...' : 'Search'}
                    </button>
                  </div>
                </form>
              </div>
              
              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-md font-semibold text-blue-400 mb-4">Search Results</h3>
                  <div className="space-y-5">
                    {searchResults.map((result, index) => (
                      <div key={index} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 hover:border-blue-500/30 transition-all">
                        <div className="flex items-center mb-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <h4 className="font-medium text-gray-200">{result.documentTitle}</h4>
                          <span className="ml-2 text-xs bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded">
                            {Math.round(result.similarity * 100)}% match
                          </span>
                        </div>
                        <div className="pl-7">
                          <p className="text-gray-400 text-sm">{result.content}</p>
                          <div className="flex mt-2">
                            <button 
                              onClick={() => {
                                const doc = documents.find(d => d.id === result.documentId);
                                if (doc) setActiveDocument(doc);
                              }}
                              className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center"
                            >
                              View Document
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {searchQuery.trim() && searchResults.length === 0 && !isSearching && (
                <div className="mt-8 text-center py-10 bg-gray-800/30 rounded-lg border border-gray-700/50">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-gray-400 font-medium">No results found</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">Try different search terms or process your documents first</p>
                </div>
              )}
            </div>
          ) : activeTab === 'rag' ? (
            <div className="rag-section">
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-blue-400 tracking-tight mb-4">Multi-Document Analysis</h2>
                <p className="text-gray-400 mb-6">Ask questions that require synthesizing information from multiple documents. The AI will analyze all relevant documents to provide comprehensive answers.</p>
                
                <form onSubmit={handleMultiDocumentRAG} className="mb-6">
                  <div className="relative">
                    <textarea
                      value={ragQuery}
                      onChange={(e) => setRagQuery(e.target.value)}
                      placeholder="Ask a question that spans multiple documents... (e.g., Which party raised council tax more on average?)"
                      rows={3}
                      className="w-full bg-gray-800 text-gray-200 rounded-lg px-4 py-3 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Try asking about council tax increases, political control, or data comparisons for comprehensive analysis.
                  </p>
                  <div className="flex justify-end mt-3 space-x-3">
                    {ragResponse && (
                      <button
                        type="button"
                        onClick={() => {
                          setRagQuery('');
                          setRagResponse('');
                        }}
                        className="px-4 py-2 rounded-md text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Clear Analysis
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isRagLoading || !ragQuery.trim()}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isRagLoading || !ragQuery.trim() ? 'bg-blue-900/50 text-blue-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                    >
                      {isRagLoading ? (
                        <span className="flex items-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          {ragQuery.toLowerCase().includes('council tax') || 
                           ragQuery.toLowerCase().includes('analysis') || 
                           ragQuery.toLowerCase().includes('average') || 
                           ragQuery.toLowerCase().includes('compare') ?
                            'Performing Data Analysis...' : 'Analyzing Documents...'}
                        </span>
                      ) : 'Analyze Documents'}
                    </button>
                  </div>
                </form>
              </div>
              
              {/* RAG Response */}
              {ragResponse && (
                <div className="mt-8 bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
                  <div className="flex items-center mb-4">
                    <div className="h-9 w-9 rounded-full bg-blue-900/50 flex items-center justify-center mr-3 flex-shrink-0">
                      {ragQuery.toLowerCase().includes('council tax') || 
                       ragQuery.toLowerCase().includes('analysis') || 
                       ragQuery.toLowerCase().includes('average') || 
                       ragQuery.toLowerCase().includes('compare') ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 01-.659 1.591L9.5 14.5m3.25-11.396c.251.023.501.05.75.082m-1.5-.082a24.301 24.301 0 00-4.5 0m12 0v5.714a2.25 2.25 0 01-.659 1.591L17.5 14.5m-3.25-11.396c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0" />
                        </svg>
                      )}
                    </div>
                    <div className="text-sm text-blue-400 font-medium">
                      {ragQuery.toLowerCase().includes('council tax') || 
                       ragQuery.toLowerCase().includes('analysis') || 
                       ragQuery.toLowerCase().includes('average') || 
                       ragQuery.toLowerCase().includes('compare') ? 
                        'Data Analysis Results' : 'Multi-Document Analysis'}
                    </div>
                  </div>
                  <div className="markdown-content pl-12" dangerouslySetInnerHTML={{ __html: ragResponse.replace(/\n/g, '<br>') }} />
                  {(ragQuery.toLowerCase().includes('council tax') || 
                    ragQuery.toLowerCase().includes('political control')) && (
                    <div className="mt-4 pt-4 border-t border-gray-700 pl-12">
                      <p className="text-xs text-gray-400">
                        <strong>Note:</strong> This analysis uses all available data from the uploaded documents, 
                        not just sample data. The results include calculations across multiple documents and data sources.
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {!ragResponse && !isRagLoading && (
                <div className="mt-8 text-center py-16 bg-gray-800/30 rounded-lg border border-gray-700/50">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-400 font-medium">Ask a question to analyze multiple documents</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">The AI will synthesize information from all relevant documents to provide a comprehensive answer</p>
                </div>
              )}
            </div>
          ) : (
            <div className="chat-section">
              {activeDocument ? (
                <>
                  <div className="flex justify-between items-center mb-5 pb-4 border-b border-gray-700">
                    <div className="flex items-center">
                      <div className="p-2.5 rounded-md bg-blue-900/40 mr-3.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="font-semibold text-gray-200 tracking-tight">{activeDocument.title}</h2>
                        <div className="flex items-center mt-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-500 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-xs text-gray-500">{formatDate(activeDocument.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      {activeDocument.metadata && activeDocument.metadata.wordCount && (
                        <div className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-md flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                          </svg>
                          {activeDocument.metadata.wordCount} words
                        </div>
                      )}
                      <button
                        onClick={() => setChatMessages([])}
                        className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2.5 py-1 rounded flex items-center transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        New Analysis
                      </button>
                    </div>
                  </div>
                  
                  <div className="chat-container bg-gray-800/50 rounded-lg mb-5 p-5 h-[calc(100vh-350px)] overflow-y-auto border border-gray-700/50">
                    {chatMessages.length === 0 ? (
                      <div className="text-center py-16">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <p className="text-gray-400 font-medium">Begin your analysis</p>
                        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">Ask a question about the document to receive detailed insights and data-driven analysis</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {chatMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            {message.role === 'assistant' && (
                              <div className="h-9 w-9 rounded-full bg-blue-900/50 flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 01-.659 1.591L9.5 14.5m3.25-11.396c.251.023.501.05.75.082m-1.5-.082a24.301 24.301 0 00-4.5 0m12 0v5.714a2.25 2.25 0 01-.659 1.591L17.5 14.5m-3.25-11.396c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0" />
                                </svg>
                              </div>
                            )}
                            
                            <div
                              className={`${message.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'} max-w-[85%]`}
                            >
                              {message.role === 'assistant' && (
                                <div className="text-xs text-blue-400 font-medium mb-1 ml-0.5">BlueEdge Analysis</div>
                              )}
                              <div className="markdown-content" dangerouslySetInnerHTML={{ __html: message.content.replace(/\n/g, '<br>') }} />
                            </div>
                            
                            {message.role === 'user' && (
                              <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center ml-3 mt-1 flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {isLoading && (
                          <div className="flex justify-start">
                            <div className="h-9 w-9 rounded-full bg-blue-900/50 flex items-center justify-center mr-3 mt-1 flex-shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 01-.659 1.591L9.5 14.5m3.25-11.396c.251.023.501.05.75.082m-1.5-.082a24.301 24.301 0 00-4.5 0m12 0v5.714a2.25 2.25 0 01-.659 1.591L17.5 14.5m-3.25-11.396c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0" />
                              </svg>
                            </div>
                            <div className="chat-message-assistant max-w-[85%]">
                              <div className="text-xs text-blue-400 font-medium mb-1 ml-0.5">BlueEdge Analysis</div>
                              <div className="loading-dots flex items-center">
                                <span className="mr-2">Processing document</span><span>.</span><span>.</span><span>.</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <form onSubmit={handleSendMessage} className="relative">
                    <input
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder="Ask a question about the document..."
                      className="w-full bg-gray-800 text-gray-200 rounded-lg pl-5 pr-16 py-3.5 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                      disabled={isLoading}
                    />
                    <button
                      type="submit"
                      className={`absolute right-2 top-1/2 transform -translate-y-1/2 rounded-md p-2.5 ${isLoading || !userInput.trim() ? 'bg-blue-900/50 text-blue-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                      disabled={isLoading || !userInput.trim()}
                    >
                      {isLoading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                  </form>
                </>
              ) : (
                <div className="text-center py-16">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-400 text-lg">No document selected</p>
                  <p className="text-gray-500 mt-2">Upload or select a document to start analyzing</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* New Folder Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-blue-400 mb-4">Create New Folder</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Enter folder name"
              className="w-full bg-gray-900 text-gray-200 rounded-lg px-4 py-3 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm mb-4"
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowFolderModal(false);
                  setNewFolderName('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddFolder}
                disabled={!newFolderName.trim()}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${!newFolderName.trim() ? 'bg-blue-900/50 text-blue-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Document Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-full max-w-md p-6">
            <div className="flex items-start mb-4">
              <div className="p-2 bg-red-900/30 rounded-md mr-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-400">Delete Document</h3>
                <p className="text-gray-300 mt-1">Are you sure you want to delete <span className="font-medium">{documentToDelete?.title}</span>?</p>
                <p className="text-sm text-gray-500 mt-2">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDocumentToDelete(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteDocument}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Processing Documents Modal */}
      {showProcessingModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-full max-w-md p-6 text-center">
            <div className="mb-4">
              {processingStatus.includes('Success') ? (
                <div className="mx-auto h-16 w-16 rounded-full bg-green-900/30 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : processingStatus.includes('Error') ? (
                <div className="mx-auto h-16 w-16 rounded-full bg-red-900/30 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              ) : (
                <div className="mx-auto h-16 w-16 rounded-full bg-blue-900/30 flex items-center justify-center mb-4">
                  <svg className="animate-spin h-8 w-8 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
              <h3 className={`text-lg font-semibold ${processingStatus.includes('Success') ? 'text-green-400' : processingStatus.includes('Error') ? 'text-red-400' : 'text-blue-400'}`}>
                {processingStatus.includes('Success') ? 'Success!' : processingStatus.includes('Error') ? 'Error' : 'Processing'}
              </h3>
              <p className="text-gray-300 mt-2">{processingStatus}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 