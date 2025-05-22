'use client';

import React, { useState } from 'react';

export default function SimplePage() {
  const [activeTab, setActiveTab] = useState('upload');

  return (
    <div className="container mx-auto p-4">
      <div className="bg-white shadow-md rounded-lg p-6">
        <h1 className="text-2xl font-bold text-blue-600 mb-6">BlueEdge - Political Research Platform</h1>
        
        <div className="flex border-b mb-6">
          <button 
            className={`py-2 px-4 ${activeTab === 'upload' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab('upload')}
          >
            Upload Document
          </button>
          <button 
            className={`py-2 px-4 ${activeTab === 'chat' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat Analysis
          </button>
        </div>
        
        {activeTab === 'upload' ? (
          <div className="upload-section">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mt-4 text-gray-600">Drag and drop files here, or click to select files</p>
              <p className="text-sm text-gray-500 mt-2">Supports PDF, DOC, DOCX, TXT, CSV, XLS, XLSX</p>
              <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                Select File
              </button>
            </div>
            
            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-4">Recent Documents</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <h3 className="font-medium">Example Document 1</h3>
                  <p className="text-sm text-gray-500">Uploaded: May 13, 2025</p>
                </div>
                <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <h3 className="font-medium">Example Document 2</h3>
                  <p className="text-sm text-gray-500">Uploaded: May 12, 2025</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-section">
            <div className="border rounded-lg mb-4 p-4 h-64 overflow-y-auto">
              <div className="mb-4 text-right">
                <div className="inline-block bg-blue-600 text-white rounded-lg px-4 py-2 max-w-xs">
                  Break down expenditure by expenditure type
                </div>
              </div>
              <div className="mb-4">
                <div className="inline-block bg-gray-100 rounded-lg px-4 py-2 max-w-xs">
                  Based on the document, here's the breakdown of expenditures:
                  <ul className="list-disc pl-5 mt-2">
                    <li>Travel: 35%</li>
                    <li>Office Supplies: 25%</li>
                    <li>Events: 20%</li>
                    <li>Research: 15%</li>
                    <li>Miscellaneous: 5%</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="flex">
              <input 
                type="text" 
                className="flex-1 border rounded-l-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ask a question about the document..."
              />
              <button className="bg-blue-600 text-white px-4 py-2 rounded-r-lg hover:bg-blue-700">
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
