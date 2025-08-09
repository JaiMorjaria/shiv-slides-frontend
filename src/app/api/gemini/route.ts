// pages/api/gemini.ts

import { NextRequest, NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

// Get the service account key from the environment variable
const serviceAccountKeyJson = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;

if (!serviceAccountKeyJson) {
  throw new Error('GCP_SERVICE_ACCOUNT_KEY_JSON environment variable is not set');
}

// Parse the JSON string into an object
const credentials = JSON.parse(serviceAccountKeyJson);

// Initialize VertexAI with project, location, and credentials
const vertex_ai = new VertexAI({
  project: '975869561973',
  location: 'us-central1',
  googleAuthOptions: {
    credentials: {
      client_email: credentials.client_email,
      client_id: credentials.client_id,
      private_key: credentials.private_key,
    },
  },
});

// Get the generative model instance
const generativeModel = vertex_ai.getGenerativeModel({
  model: 'projects/975869561973/locations/us-central1/endpoints/1786384238229061632',

});

const generationConfig = {
    maxOutputTokens: 8192,
    temperature: 1,
    topP: 0.95,
}

export async function POST(req: NextRequest) {
  try {
    const { chunk, sectionTitle } = await req.json();

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
    
    const result = await generativeModel.generateContent({ contents, generationConfig });
    const rewrittenChunkText = result.response?.candidates[0].content.parts[0].text;
    if (rewrittenChunkText) {
      return NextResponse.json({ rewrittenChunkText }, { status: 200 });
    } else {
      return NextResponse.json({ error: 'Failed to get a response from the model.' }, { status: 500 });
    }

  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}