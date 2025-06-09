"use client"; 

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface ScrapedData {
  requested_url: string;
  title?: string | null;
  headings_h1: string[];
  paragraphs: string[];
  raw_html?: string;  
}

interface ApiError {
  detail: string | { msg: string; type: string }[] ; // FastAPI can return simple string or structured errors
}

interface TreeNode {
  name: string;
  children: TreeNode[];
  attributes?: { [key: string]: string };
  content?: string;
}

export default function ScraperPage() {
  const [urlToScrape, setUrlToScrape] = useState<string>('');
  const [scrapedContent, setScrapedContent] = useState<ScrapedData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter();
  
  const TreeView = ({ node, level = 0 }: { node: TreeNode; level?: number }) => {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;
  const indent = level * 20;
  
  return (
    <div style={{ marginLeft: `${indent}px`, fontSize: '14px', fontFamily: 'monospace' }}>
      <div 
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
        style={{ cursor: hasChildren ? 'pointer' : 'default' }}
      >
        {hasChildren && <span style={{ marginRight: '5px' }}>
          {isExpanded ? '▼' : '▶'}</span>}
        <span style={{ color: '#e06c75' }}>&lt;{node.name}</span>
        {node.attributes && Object.entries(node.attributes).map(([key, value]) => (
          <span key={key}>
            <span style={{ color: '#d19a66' }}> {key}</span>
            <span style={{ color: '#98c379' }}>="{value}"</span>
          </span>
        ))}
        <span style={{ color: '#e06c75' }}>&gt;</span>
        {node.content && <span style={{ color: '#abb2bf', marginLeft: '5px' }}>{node.content.substring(0, 50)}...</span>}
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child, index) => (
            <TreeView key={index} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};
   function sanitizeHTML(htmlString: string, urlToScrape: string): string {
   const tagsToRemove: string[] = ['meta', 'noscript'];
   let cleanHTML: string = htmlString;
  
   //Cover Image paths
   cleanHTML = cleanHTML.replace(/src="\/assets\//g, `src="${urlToScrape}/assets/`);
   cleanHTML = cleanHTML.replace(/href="\/assets\//g, `href="${urlToScrape}/assets/`);
   cleanHTML = cleanHTML.replace(/url\(\/assets\//g, `url(${urlToScrape}/assets/`);

   cleanHTML = cleanHTML.replace(/src="\//g, `src="${urlToScrape}/`);
   cleanHTML = cleanHTML.replace(/href="\//g, `href="${urlToScrape}/`);
   cleanHTML = cleanHTML.replace(/url\(\//g, `url(${urlToScrape}/`);
   
   //Cover video paths
   cleanHTML = cleanHTML.replace(/src="\/videos\//g, `src="${urlToScrape}/videos/`);
   cleanHTML = cleanHTML.replace(/href="\/videos\//g, `href="${urlToScrape}/videos/`);
   cleanHTML = cleanHTML.replace(/url\(\/videos\//g, `url(${urlToScrape}/videos/`);

   tagsToRemove.forEach((tag: string) => {
     const regex = new RegExp(`<${tag}[^>]*>.*?<\/${tag}>`, 'gis');
     cleanHTML = cleanHTML.replace(regex, '');
     const selfClosingRegex = new RegExp(`<${tag}[^>]*\/?>`, 'gi');
     cleanHTML = cleanHTML.replace(selfClosingRegex, '');
   });
  
   return cleanHTML;
 }

  const parseHTMLToTree = (html: string): TreeNode[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const convertNodeToTree = (node: Node): TreeNode | null => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const attributes: { [key: string]: string } = {};
      
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attributes[attr.name] = attr.value;
      }
      
      return {
        name: element.tagName.toLowerCase(),
        children: Array.from(element.childNodes).map(convertNodeToTree).filter(Boolean) as TreeNode[],
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
        content: Array.from(element.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent?.trim() || '')
          .filter(text => text.length > 0)
          .join(' ') || ''
      };
    }
    return null;
  };
  
  return Array.from(doc.documentElement.childNodes).map(convertNodeToTree).filter(Boolean) as TreeNode[];
};
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
    setScrapedContent(data); 
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
  router.push(`/results?url=${encodeURIComponent(urlToScrape)}`);
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
  type="button"
  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-green-300"
>
  {'Clone with AI'}
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
  <div style={{ 
    border: '1px solid #eee', 
    padding: '15px', 
    borderRadius: '4px', 
    backgroundColor: '#282c34', 
    color: '#abb2bf' 
  }}>
    <h3 style={{ color: '#61dafb' }}>DOM Tree Structure:</h3>
    {scrapedContent.raw_html ? (
      <div style={{ 
        maxHeight: '600px', 
        overflow: 'auto', 
        border: '1px solid #444', 
        padding: '10px', 
        backgroundColor: '#1e2127',
        borderRadius: '4px'
      }}>
        {parseHTMLToTree(sanitizeHTML(scrapedContent.raw_html, urlToScrape)).map((node, index) => (
          <TreeView key={index} node={node} />
        ))}
      </div>
    ) : (
      <p>No HTML content available.</p>
    )}
  </div>
)}
    </div>
  );
}