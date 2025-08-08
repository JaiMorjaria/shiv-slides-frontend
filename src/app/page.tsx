"use client";
import React, { useState } from 'react';

// const SYSTEM_PROMPT = `You are a LaTeX slide generator trained on Shiv Morjaria’s lecture slides. Convert input text into professional, dense LaTeX slides in his style.

// Formatting Rules:

// Output only valid LaTeX using \\begin{frame} / \\end{frame}
// Use \\frametitle{} for titles
// Add \\pause after each sentence and list item
// Use full sentences and never split bullets or ideas across frames
// Make each frame dense (≥ 500 characters). Merge short content to avoid sparse slides
// Preserve technical tone — no casual phrases or markdown
// Use concise, topic-specific frame titles
// Do not include source lines or markdown formatting
// `;

// const FEW_SHOT_EXAMPLES = `Example 1:
// Input: The ORSA is an internally conducted assessment of an insurer's risks, capital needs and solvency position. ORSA should:

// \\begin{itemize}
//     \\item Consider all foreseeable and relevant material risks
//     \\item Be forward looking
//     \\item Align with the insurer's business and strategic planning
//     \\item Include stress and scenario testing to determine needs, risks and capital adequacy
//     \\item Be available for OSFI to review, if requested
// \\end{itemize}

// Output:
// \\begin{frame}{ORSA Overview}
// \\pause

// The ORSA is an internally conducted assessment of an insurer's risks, capital needs and solvency position. ORSA should: \\pause

// \\begin{itemize}
//     \\item Consider all foreseeable and relevant material risks
//     \\item Be forward looking
//     \\item Align with the insurer's business and strategic planning
//     \\item Include stress and scenario testing to determine needs, risks and capital adequacy
//     \\item Be available for OSFI to review, if requested
// \\end{itemize}
// \\end{frame}

// Example 2:
// Input: There are five main elements that every ORSA should, at minimum, address:

// \\begin{enumerate}
//     \\item Comprehensive Risk Identification and Assessment
//     \\item Relating Risk to Capital
//     \\item Oversight
//     \\item Monitoring and Reporting
//     \\item Internal Controls and Objective Review
// \\end{enumerate}

// Output:
// \\begin{frame}{Key Considerations}
// \\pause
// Five main elements for every ORSA to address: \\pause

// \\begin{enumerate}
//     \\item Comprehensive Risk Identification and Assessment
//     \\item Relating Risk to Capital
//     \\item Oversight
//     \\item Monitoring and Reporting
//     \\item Internal Controls and Objective Review
// \\end{enumerate}
// \\end{frame}

// Example 3:
// Input:
// \\begin{itemize}
//     \\item ERM should utilize the stress-testing results to identify and implement countermeasures to improve the firm's solvency including:
//     \\begin{itemize}
//         \\item Raising additional capital
//         \\item Slowing/ceasing new business
//         \\item Entering reinsurance arrangements
//         \\item Changing product pricing
//         \\item Changes in business mix
//     \\end{itemize}
// \\end{itemize}

// Output:
// \\begin{frame}{Stress-Testing for ERM}
// \\pause

// ERM should use stress-testing results to implement solvency-improving countermeasures, including: \\pause
// \\begin{itemize}
//     \\item Raising additional capital
//     \\item Slowing/ceasing new business
//     \\item Entering reinsurance arrangements
//     \\item Changing product pricing
//     \\item Changes in business mix
// \\end{itemize}
// \\end{frame}

// Now convert this input text following the same style and format:`;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}


interface Chunk {
  title: string;
  content: string;
}

function chunkBySubsubsectionOrSection(content: string): Chunk[] {
  // Try to split by \subsubsection first, fallback to \section if none found (like Python)
  const subsubRegex = /\\subsubsection\{([^}]*)\}/g;
  const result = [];
  let lastIndex = 0;
  let match;
  let prevTitle = null;
  while ((match = subsubRegex.exec(content)) !== null) {
    if (prevTitle !== null) {
      result.push({
        title: prevTitle,
        content: content.substring(lastIndex, match.index).trim(),
      });
    }
    prevTitle = match[1];
    lastIndex = subsubRegex.lastIndex;
  }
  if (prevTitle !== null) {
    result.push({
      title: prevTitle,
      content: content.substring(lastIndex).trim(),
    });
  }
  // If no subsubsections found, fallback to splitting by \section
  if (result.length === 0) {
    const sectionRegex = /\\section\{([^}]*)\}/g;
    const sectionResult = [];
    let lastSectionIndex = 0;
    let sectionMatch;
    let prevSectionTitle = null;
    while ((sectionMatch = sectionRegex.exec(content)) !== null) {
      if (prevSectionTitle !== null) {
        sectionResult.push({
          title: prevSectionTitle,
          content: content.substring(lastSectionIndex, sectionMatch.index).trim(),
        });
      }
      prevSectionTitle = sectionMatch[1];
      lastSectionIndex = sectionRegex.lastIndex;
    }
    if (prevSectionTitle !== null) {
      sectionResult.push({
        title: prevSectionTitle,
        content: content.substring(lastSectionIndex).trim(),
      });
    }
    return sectionResult;
  }
  return result;
}


async function callGemini(chunk: string, sectionTitle: string): Promise<string> {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunk, sectionTitle })
  });
  const data = await response.json();
  console.log('Gemini response data:', data)
  if (data.error) throw new Error(data.error);
  return data.rewrittenChunkText;
}

// For type-safe window.texContent
declare global {
  interface Window {
    texContent?: string;
  }
}

export default function Home() {
  const [processing, setProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const keyTopicsSlide = `
\\begin{frame}[shrink]
\\frametitle{Key Exam Topics}
\\tableofcontents[hideallsubsections]
\\end{frame}
`;

const summarySlide = `
\\begin{frame}[shrink]
\\frametitle{Summary}
\\tableofcontents[hideallsubsections]
\\end{frame}
`;

function makeTitleSlide(sectionTitle:string, sourceValue:string) {
  return `
\\begin{frame}[c]\\frametitle{${sectionTitle}}
    \\begin{center}
    \\Large{\\textbf{${sectionTitle}}}

    \\normalsize
    \\vspace{3em}

    \\textit{Source: ${sourceValue}}
    \\vspace{1em}

    Video By: Shiv Morjaria, FSA, MAAA
    \\end{center}
\\end{frame}
`;
}

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    setOutput('');
    setDownloadUrl('');
    setError('');
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setFileName(file.name);
    const text = await file.text();
    window.texContent = text; // for debugging
  };

  const handleProcess = async (): Promise<void> => {
    setProcessing(true);
    setError('');
    setOutput('');
    setDownloadUrl('');
    try {
      if (!window.texContent) throw new Error('No .tex file loaded');
      // Chunk the LaTeX
      const chunks = chunkBySubsubsectionOrSection(window.texContent);
      const rewritten = [];
      for (let i = 0; i < chunks.length; i++) {
        setOutput(`Processing chunk ${i + 1} of ${chunks.length}...`);
        console.log(`Chunk ${i + 1}`);
        // Retry Gemini call up to 3 times if error (like Python robustness)
        let rewrittenChunk = null;
        let attempt = 0;
        let lastError = null;
        while (attempt < 3) {
          try {
            rewrittenChunk = await callGemini(chunks[i].content, chunks[i].title);
            if (!rewrittenChunk) {
              throw new Error('No output');
            }
            break; // success
          } catch (err) {
            lastError = err;
            console.error(`Gemini error on chunk ${i + 1}, attempt ${attempt + 1}:`, lastError, '\nInput chunk:', chunks[i]);
            await sleep(1000); // short wait before retry
          }
          attempt++;
        }
        if (!rewrittenChunk) {
          rewrittenChunk = `% ERROR: Gemini failed after 3 attempts on chunk ${i + 1}`;
        }
        rewritten.push(rewrittenChunk);
        if (i < chunks.length - 1) {
          await sleep(5000); // 2 second delay between requests
        }
      }
      // Extract section title from the first \\section or fallback to filename
      let sectionTitle = fileName.replace(/\.tex$/i, '');
      const sectionMatch = window.texContent.match(/\\section\{([^}]*)\}/);
      if (sectionMatch) {
        sectionTitle = sectionMatch[1];
      }
      const sourceValue = fileName;

      const newTex =
        makeTitleSlide(sectionTitle, sourceValue) +
        '\n\n' +
        keyTopicsSlide +
        '\n\n' +
        rewritten.join('\n\n') +
        '\n\n' +
        summarySlide;

      setOutput(newTex);
      // Download link
      const blob = new Blob([newTex], { type: 'text/x-tex' });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError('An unknown error occurred.');
      }
    }
    setProcessing(false);
  };

  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh'}}>
      <h1>Hi, Shiv.</h1>
      <h2>Upload your .tex file and Gemini will convert it to slides for you.</h2>
      <div style={{ marginBottom: 20 }}>
        <input
          type="file"
          accept=".tex"
          onChange={handleFileChange}
          disabled={processing}
        />
        {fileName && <span style={{ marginLeft: 10 }}>{fileName}</span>}
      </div>
      <button
        onClick={handleProcess}
        disabled={!fileName || processing}
        style={{ padding: '8px 20px', fontSize: 16 }}
      >
        {processing ? 'Processing...' : 'Rewrite & Download'}
      </button>
      {error && <div style={{ color: 'red', marginTop: 20 }}>{error}</div>}
      {output && !processing && (
        <div style={{ marginTop: 30 }}>
          <h3>Output Preview</h3>
          <pre style={{
  background: '#181818',
  color: '#f8f8f2',
  padding: 15,
  maxHeight: 300,
  overflow: 'auto',
  borderRadius: 8,
  fontFamily: "'Fira Mono', 'Consolas', 'Menlo', monospace",
  boxShadow: '0 2px 12px #0005'
}}>{output.slice(0, 2000)}{output.length > 2000 ? '\n... (truncated)' : ''}</pre>
        </div>
      )}
      {downloadUrl && (
        <div style={{ marginTop: 20 }}>
          <a href={downloadUrl} download={fileName.replace(/\.tex$/, '_slides.tex')} style={{ fontSize: 18, color: 'blue' }}>
            Download Slides .tex
          </a>
        </div>
      )}
      <div style={{ marginTop: 40, fontSize: 12, color: '#888' }}>
        <b>Warning:</b> Your Gemini API key is used only in this browser session and never sent anywhere else. For demo/hackathon use only.
      </div>
    </div>
  );
}


