import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Check if GEMINI_API_KEY is configured in environment variables
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    return NextResponse.json({
      configured: !!geminiApiKey && geminiApiKey.length > 0 && geminiApiKey !== 'your_gemini_api_key_here',
      message: geminiApiKey ? 'Gemini API key is configured' : 'Gemini API key is not configured'
    });
  } catch (error: any) {
    console.error('Error checking Gemini API key:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred while checking Gemini API key' },
      { status: 500 }
    );
  }
}
