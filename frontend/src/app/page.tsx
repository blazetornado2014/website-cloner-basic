"use client"; 

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface ScrapedData {
  requested_url: string;
  title?: string | null;
  headings_h1: string[];
  paragraphs: string[];
}

interface ApiError {
  detail: string | { msg: string; type: string }[] ; // FastAPI can return simple string or structured errors
}


export default function ScraperPage() {
  const [urlToScrape, setUrlToScrape] = useState<string>('');
  const [scrapedContent, setScrapedContent] = useState<ScrapedData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [llmHtml, setLlmHtml] = useState<string>('');
  const [isCloning, setIsCloning] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  setSuccessMessage(null);
  if (!urlToScrape) {
    setError('Please enter a URL to scrape.');
    return;
  }

  setIsLoading(true);
  setScrapedContent(null);
  setError(null);

  const backendApiUrl = process.env.NEXT_PUBLIC_SCRAPER_API_URL || 'http://127.0.0.1:8000';

  try {
    const response = await fetch(
      `${backendApiUrl}/scrape-website?url_to_scrape=${encodeURIComponent(urlToScrape)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData: ApiError = await response.json();
      let errorMessage = `Error ${response.status}: `;
      if (typeof errorData.detail === 'string') {
        errorMessage += errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        errorMessage += errorData.detail.map(err => `${err.msg} (for ${ (err as any).loc ? (err as any).loc.join('.') : 'input'})`).join(', ');
      } else {
        errorMessage += response.statusText;
      }
      throw new Error(errorMessage);
    }

    const data: ScrapedData = await response.json();
    setScrapedContent(null); 
    setSuccessMessage('Scraping successful');
    setError(null);
  } catch (err: any) {
    console.error('Scraping failed:', err);
    setError(err.message || 'An unexpected error occurred. Check the console.');
  } finally {
    setIsLoading(false);
  }
};

  const handleCloneWebsite = async () => {
  if (!urlToScrape) return;
  
  setIsCloning(true);
  try {
    const response = await fetch('http://127.0.0.1:8000/clone-website', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: urlToScrape }),
    });
    
  const data = await response.json();
  router.push(`/results?url=${encodeURIComponent(urlToScrape)}`);
  } catch (error) {
    console.error('Error cloning website:', error);
  } finally {
    setIsCloning(false);
  }
};

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Website Scraper</h1>
      <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
        <input
          type="url" 
          value={urlToScrape}
          onChange={(e) => setUrlToScrape(e.target.value)}
          placeholder="Enter website URL (e.g., https://example.com)"
          required
          style={{ width: '70%', padding: '10px', marginRight: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <button
          type="submit"
          disabled={isLoading}
          style={{ padding: '10px 15px', backgroundColor: isLoading ? '#ccc' : '#0070f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          {isLoading ? 'Scraping...' : 'Scrape Website'}
        </button>
        <button
  onClick={handleCloneWebsite}
  disabled={isCloning}
  type="button"
  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-green-300"
>
  {isCloning ? 'Generating with AI...' : 'Clone with AI'}
</button>
      </form>

      {error && (
        <div style={{ color: 'red', border: '1px solid red', padding: '10px', marginBottom: '20px', borderRadius: '4px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      {successMessage && (
  <div style={{ color: 'green', border: '1px solid green', padding: '10px', marginBottom: '20px', borderRadius: '4px', backgroundColor: '#f0fff0' }}>
    <strong>Success:</strong> {successMessage}
  </div>
      )}

      {scrapedContent && (
        <div style={{ border: '1px solid #eee', padding: '15px', borderRadius: '4px', backgroundColor: '#f9f9f9', color: 'black' }}>
          {scrapedContent.title && <p><strong>Title:</strong> {scrapedContent.title}</p>}

          {scrapedContent.headings_h1 && scrapedContent.headings_h1.length > 0 && (
            <div>
              <h3>H1 Headings:</h3>
              <ul>
                {scrapedContent.headings_h1.map((h1, index) => (
                  <li key={`h1-${index}`}>{h1}</li>
                ))}
              </ul>
            </div>
          )}

          {scrapedContent.paragraphs && scrapedContent.paragraphs.length > 0 && (
            <div>
              <h3>Paragraphs:</h3>
              <ul>
                {scrapedContent.paragraphs.map((p, index) => (
                  <li key={`p-${index}`}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {!scrapedContent.title && scrapedContent.headings_h1.length === 0 && scrapedContent.paragraphs.length === 0 && (
            <p>No specific content (title, H1s, paragraphs) extracted with current selectors.</p>
          )}
        </div>
      )}
    </div>
  );
}