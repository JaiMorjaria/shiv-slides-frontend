import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Initialize Vertex with your Cloud project and location
const ai = new GoogleGenAI({
  vertexai: true,
  project: '975869561973',
  location: 'us-central1',
  apiKey: GEMINI_API_KEY
});
const model = 'projects/975869561973/locations/us-central1/endpoints/1786384238229061632';

// Set up generation config
const generationConfig = {
  maxOutputTokens: 8192,
  temperature: 1,
  topP: 0.95,
};

export async function POST(req: NextRequest) {
  try {
    const { chunk, sectionTitle } = await req.json();

    // Compose the prompt for Gemini
    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: `Input (section: ${sectionTitle}):\n${chunk}`
          }
        ]
      }
    ];

    const genReq = {
      model,
      contents,
      config: generationConfig,
    };

    // Stream Gemini output and collect the full result
    let rewrittenChunk = await ai.models.generateContent(genReq);

    if(rewrittenChunk !== null && rewrittenChunk.text) {
      const rewrittenChunkText = rewrittenChunk.text;
      // If the output is a string, return it directly
      return NextResponse.json({ rewrittenChunkText }, { status: 200 });
    }  
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}