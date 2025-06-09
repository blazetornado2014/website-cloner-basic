'use client'

import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url');
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const processImageUrls = (html: string) => {
  return html
    .replace(
      /src="https:\/\/www\.orchids\.app\/_next\/image\?url=([^"&]+)(?:&[^"]*)?"/g,
      (match, encodedUrl) => {
        const decodedUrl = decodeURIComponent(encodedUrl);
        return `src="${decodedUrl}"`;
      }
    )
    .replace(/src="([^"]*?)&amp;w=\d+&amp;q=\d+"/g, 'src="$1"')
    .replace(/&amp;/g, '&'); 
};

  useEffect(() => {
    const fetchGeneratedHtml = async () => {
      if (!url) return;
      
      setIsLoading(true);
      try {
        const response = await fetch('http://127.0.0.1:8000/clone-website', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url }),
        });
        
        const data = await response.json();
        setGeneratedHtml(data.generated_html);
      } catch (error) {
        console.error('Error fetching generated HTML:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGeneratedHtml();
  }, [url]);

  if (isLoading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Generating AI Clone...</h1>
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  return (
  <div className="w-full h-screen overflow-hidden">
    {isLoading ? (
      <div className="flex items-center justify-center h-full">
        <div className="text-xl">Generating AI Clone...</div>
      </div>
    ) : (
      generatedHtml && (
        <div 
          className="w-full h-full overflow-auto"
          dangerouslySetInnerHTML={{ 
            __html: processImageUrls(generatedHtml.replace(/```html\n?/g, '').replace(/\n?```/g, '') 
      )}}
        />
      )
    )}
  </div>
);
}