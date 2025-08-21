"use client";
import { parse } from 'path';
import React, { useState } from 'react';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}


interface Chunk {
  title: string;
  content: string;
}

function chunkBySubsubsection(content: string): Chunk[] {
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
  
  return result;
}


async function callGemini(chunk: string, sectionTitle: string): Promise<string> {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunk, sectionTitle })
  });
  const data = await response.json();
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
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [loadingSection, setLoadingSection] = useState<string | null>(null);
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


function parse_frames(content: string): string[] {
  const frameRegex = /(\\begin{frame}[\s\S]*?\\end{frame})/g;
  const frames = [];
  let match;

  while ((match = frameRegex.exec(content)) !== null) {
    frames.push(match[1].trim());
  }

  return frames;
}

function isLastTextLine(lines:string[], index:number):boolean {  // Change parameter name
  if (index === -1 || index === lines.length - 1) {
    return true; 
  } else {
    for (let i = index + 1; i < lines.length; i++) { 
      if (lines[i].trim() === "" || lines[i].includes("\\end{")) {
        continue; 
      } else {
        return false; 
      }
    }
  }
  return true;
}


function isTextLine(line:string): boolean {
  return line.trim() !== "" && !line.includes("\\begin{") && !line.includes("\\end{");
}


function monitor_pauses(chunkText:string): string {
  const frames = parse_frames(chunkText);
  
  return frames.map(frame => {
    // Remove existing pauses first
    const cleanFrame = frame.replace(/\\pause/g, '');
    const lines = cleanFrame.split('\n');
    
    return lines.map((line, index) => {
      if (line.includes("\\begin{") || line.includes("\\end{") || line.includes("\\frametitle{")) {
        return line;
      } else if (isTextLine(line) && !isLastTextLine(lines, index)) {
        return line + " \\pause";  
      } else {
        return line; // Structure or last text line
      }
    }).join('\n');
  }).join('\n\n');
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
      const chunks = chunkBySubsubsection(window.texContent);
      const rewritten = [];
      for (let i = 1; i < chunks.length; i++) {
        setLoadingSection(chunks[i].title || `Chunk ${i + 1}`);
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
            await sleep(1000); // short wait before retry
          }
          attempt++;
        }
        if (!rewrittenChunk) {
          rewrittenChunk = `% ERROR: Gemini failed after 3 attempts on chunk ${i + 1}`;
        }
        
        rewrittenChunk = monitor_pauses(rewrittenChunk);
        rewritten.push(rewrittenChunk);

        
        if (i < chunks.length - 1) {
          await sleep(5000); // 2 second delay between requests
        }
      }
      setLoadingSection(null);
      // Extract section title from the first \\section or fallback to filename
      let sectionTitle = fileName.replace(/\.tex$/i, '');
      const sectionMatch = window.texContent.match(/\\section\{([^}]*)\}/);
      if (sectionMatch) {
        sectionTitle = sectionMatch[1];
      }
      const sourceValue = window.texContent.match(/\\source\{([^}]*)\}/)?.[1] || fileName;

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
      setLoadingSection(null);
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError('An unknown error occurred.');
      }
    }
    setProcessing(false);
  };


  return (
    <>
      {/* Hero Section */}
      <div className="hero">
        <h1 style={{ fontSize: '3.2rem', fontWeight: 800, letterSpacing: '-1.5px', marginBottom: '0.5rem', lineHeight: 1.13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <span role="img" aria-label="robot" style={{ fontSize: '2.3rem', verticalAlign: 'middle' }}>🤖</span>
          Hi, Shiv.
        </h1>
        <div className="subtitle" style={{ fontSize: '1.25rem', fontWeight: 500, maxWidth: 540, margin: '0 auto' }}>
          Turn your DSMs into dense, professional Shiv-style slides with one click.
        </div>
        <button className="about-btn" onClick={() => setShowInfo(true)}>
          Why did you do this, buttface? Apart from the $11,067 elephant in the room?
        </button>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <div className="info-modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="info-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowInfo(false)} aria-label="Close info">×</button>
            <h2 style={{ marginTop: 0, display: 'flex', justifyContent: 'center' }}>About this project</h2>
            <p> Hi Shiv, </p>
            <p> I don&#39;t like pretending things are just okay when I mess up, but I&#39;ve been doing it for far too long. </p>
            <p> I didn&#39;t prioritize your work nearly enough over the years, and I&#39;m sorry for that. While sometimes my work is really good, other times it&#39;s a mess, and you deserve something more reliable. </p>
            <p> Consider this an apology, and hopefully something that you&#39;ll find useful. Upload one of your completed readings and let&#39;s see how well an AI trained on your writing style does. </p>
            <p> Also, if you like it, let's talk about other tools I can build for you: flash card maker, HTML converter, anything else you can think of.</p>
            <p> <b> Love you, big bro. </b></p>
          </div>
        </div>
      )}

      {/* Upload Card */}
      <div className="upload-card">
        <label className="upload-label">
          <input
            type="file"
            accept=".tex"
            onChange={handleFileChange}
            disabled={processing}
          />
          {fileName ? 'Change File' : 'Choose .tex File'}
        </label>
        {fileName && <div className="selected-file">{fileName}</div>}
        <button
          onClick={handleProcess}
          disabled={!fileName || processing}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded shadow"
          style={{ fontSize: 17, width: '100%', maxWidth: 250 }}
        >
          {processing ? 'Processing...' : 'Rewrite & Download'}
        </button>
        {error && <div style={{ color: 'red', marginTop: 10 }}>{error}</div>}
        {downloadUrl && (
          <a href={downloadUrl} download={fileName.replace(/\.tex$/, '_slides.tex')} style={{ fontSize: 17, color: '#6366f1', marginTop: 10, fontWeight: 600 }}>
            Download Slides .tex
          </a>
        )}
      </div>

      {/* Output Preview Window */}
      {output && !processing && (
        <div className="preview-window">
          <div style={{ fontWeight: 700, fontSize: '1.12rem', marginBottom: 8, color: '#6366f1' }}>Output Preview</div>
          <pre style={{ margin: 0, background: 'none', color: '#232323', fontSize: '1.04rem', maxHeight: 320, overflow: 'auto', border: 'none', boxShadow: 'none', padding: 0 }}>
            {output.slice(0, 2000)}{output.length > 2000 ? '\n... (truncated)' : ''}
          </pre>
        </div>
      )}

      {/* Inline Loading Animation */}
      {processing && loadingSection && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 0 1.5rem 0' }}>
          <div className="loading-spinner" style={{ width: 36, height: 36, marginBottom: 10 }}></div>
          <div className="loading-section-name" style={{ fontSize: '1.08rem', color: '#6366f1', fontWeight: 600 }}>
            Processing section: <span style={{ fontWeight: 700 }}>{loadingSection}</span>
          </div>
        </div>
      )}

    </>
  );
}


