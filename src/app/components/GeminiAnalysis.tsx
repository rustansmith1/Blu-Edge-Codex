import React, { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

interface GeminiAnalysisProps {
  className?: string;
}

const GeminiAnalysis: React.FC<GeminiAnalysisProps> = ({ className }) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);

  // Check if Gemini API key is configured
  React.useEffect(() => {
    const checkApiKey = async () => {
      try {
        const response = await axios.get('/api/gemini/check');
        setApiKeyConfigured(response.data.configured);
      } catch (error) {
        console.error('Error checking Gemini API key:', error);
        setApiKeyConfigured(false);
      }
    };

    checkApiKey();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setIsLoading(true);
    setResponse('');
    setError(null);
    
    try {
      const response = await axios.post('/api/gemini', {
        query,
        limit: 20, // Higher limit for Gemini since it can handle more context
      });
      
      setResponse(response.data.response || '');
    } catch (error: any) {
      console.error('Error using Gemini API:', error);
      setError(error.response?.data?.error || 'Failed to perform analysis with Gemini');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`gemini-analysis ${className || ''}`}>
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <div className="h-8 w-8 rounded-full bg-purple-900/50 flex items-center justify-center mr-3 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-purple-400 tracking-tight">Gemini Analysis (Large Documents)</h2>
        </div>
        
        <p className="text-gray-400 mb-6">
          Use Google's Gemini model to analyze very large documents or complex data that exceeds OpenAI's token limits.
          Gemini can process much more text at once, making it ideal for comprehensive data analysis.
        </p>
        
        {apiKeyConfigured === false && (
          <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-800 rounded-md">
            <div className="flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-yellow-500">Gemini API Key Not Configured</h3>
                <p className="text-xs text-gray-400 mt-1">
                  To use Gemini for analyzing large documents, add your Gemini API key to the <code className="bg-gray-800 px-1 py-0.5 rounded text-xs">.env.local</code> file:
                </p>
                <pre className="mt-2 bg-gray-800 p-2 rounded text-xs text-gray-300 overflow-x-auto">
                  GEMINI_API_KEY=your_gemini_api_key_here
                </pre>
                <p className="text-xs text-gray-400 mt-2">
                  Get a Gemini API key from <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">https://ai.google.dev/</a>
                </p>
              </div>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="relative">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about large documents or complex data analysis..."
              rows={3}
              disabled={apiKeyConfigured === false}
              className={`w-full bg-gray-800 text-gray-200 rounded-lg px-4 py-3 border ${apiKeyConfigured === false ? 'border-gray-700 bg-gray-800/50 cursor-not-allowed' : 'border-purple-700/50 focus:border-purple-500'} focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-sm`}
            />
          </div>
          <div className="flex justify-end mt-3 space-x-3">
            {response && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResponse('');
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
              disabled={isLoading || !query.trim() || apiKeyConfigured === false}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isLoading || !query.trim() || apiKeyConfigured === false ? 'bg-purple-900/50 text-purple-300 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing with Gemini...
                </span>
              ) : 'Analyze with Gemini'}
            </button>
          </div>
        </form>
      </div>
      
      {error && (
        <div className="mt-6 p-4 bg-red-900/30 border border-red-800 rounded-md">
          <div className="flex items-start">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-red-500">Error</h3>
              <p className="text-xs text-gray-400 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Gemini Response */}
      {response && (
        <div className="mt-8 bg-gray-800/50 rounded-lg p-6 border border-purple-700/30">
          <div className="flex items-center mb-4">
            <div className="h-9 w-9 rounded-full bg-purple-900/50 flex items-center justify-center mr-3 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="text-sm text-purple-400 font-medium">Gemini Analysis Results</div>
          </div>
          <div className="markdown-content pl-12 prose prose-invert max-w-none">
            <ReactMarkdown>{response}</ReactMarkdown>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-700 pl-12">
            <p className="text-xs text-gray-400">
              <strong>Note:</strong> This analysis was performed using Google's Gemini model, which can process much larger documents than OpenAI's models.
              Gemini has a context window of approximately 1 million tokens, allowing for more comprehensive analysis of large datasets.
            </p>
          </div>
        </div>
      )}
      
      {!response && !isLoading && !error && (
        <div className="mt-8 text-center py-16 bg-gray-800/30 rounded-lg border border-purple-700/20">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-gray-400 font-medium">Ask Gemini to analyze large documents</p>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            Perfect for complex data analysis that exceeds OpenAI's token limits
          </p>
        </div>
      )}
    </div>
  );
};

export default GeminiAnalysis;
