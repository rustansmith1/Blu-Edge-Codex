import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get all environment variables
    const envVars = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'not set',
      GEMINI_API_KEY_LENGTH: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'set (hidden)' : 'not set',
      NODE_ENV: process.env.NODE_ENV || 'not set',
    };
    
    return NextResponse.json({
      message: 'Environment variables test',
      environment: process.env.NODE_ENV,
      envVars,
      allKeys: Object.keys(process.env),
    });
  } catch (error: any) {
    console.error('Error in env-test route:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    );
  }
}
