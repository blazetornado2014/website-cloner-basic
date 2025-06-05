from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import requests
from bs4 import BeautifulSoup, Tag
from pydantic import BaseModel, HttpUrl
from typing import List, Optional
import google.generativeai as genai
import os
from dotenv import load_dotenv
import cssutils
import logging

cssutils.log.setLevel(logging.CRITICAL) 
logging.basicConfig(level=logging.INFO)

load_dotenv()
def configure_gemini_api():
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            logging.error("GEMINI_API_KEY environment variable is not set")
            raise ValueError("Missing required environment variable: GEMINI_API_KEY")
        
        genai.configure(api_key=api_key)
        logging.info("Gemini API configured successfully")
        return True
        
    except Exception as e:
        logging.error(f"Failed to configure Gemini API: {e}")
        raise

configure_gemini_api()
CLONE_WEBSITE_PROMPT = """
You are an expert web developer who replicates websites with 100% accuracy. Clone this website with all its styles and structure.

Original URL: {url}

CSS Styles Found:{all_styles}  

Inline Styles: {inline_styles}  

DOM Structure: {dom_structure}
Content:
Title: {title}
Headings: {headings}
Paragraphs: {paragraphs}

Create a complete HTML document that:
1. Includes all the CSS styles (in <style> tags)
2. Preserves the DOM structure and hierarchy
3. Maintains all inline styles
4. Keeps the same visual appearance
5. If you cannot find a specific style, use a default style that matches the original as closely as possible.
6. If you cannot find an image, use a placeholder image.
"""

app = FastAPI(
    title="Website Scraper API",
    description="An API to scrape basic information from websites.",
    version="0.1.0",
)

origins = [
    "http://localhost:3000", # TODO: Prod needs proper URLs
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"], 
    allow_headers=["*"], 
)

class ScrapeRequest(BaseModel):
    url: HttpUrl

class ScrapedPageInfo(BaseModel):
    requested_url: str
    title: Optional[str] = None
    headings_h1: List[str] = []
    paragraphs: List[str] = []

def perform_scrape(target_url: str) -> ScrapedPageInfo:
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 ScraperBot/1.0 (+http://yourdomain.com/botinfo)' # Be a good bot
        }
        response = requests.get(target_url, headers=headers, timeout=15) 
        response.raise_for_status()  

        soup = BeautifulSoup(response.content, 'html.parser')

        title = soup.title.string.strip() if soup.title else None

        headings_h1 = [h1.get_text(strip=True) for h1 in soup.find_all('h1')]

        paragraphs = [p.get_text(strip=True) for p in soup.find_all('p')]

        return ScrapedPageInfo(
            requested_url=target_url,
            title=title,
            headings_h1=headings_h1,
            paragraphs=paragraphs,
        )

    except requests.exceptions.Timeout:
        raise HTTPException(status_code=408, detail=f"Request to {target_url} timed out.")
    except requests.exceptions.HTTPError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"HTTP error fetching {target_url}: {e.response.reason}")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Failed to fetch URL {target_url}: {str(e)}")
    except Exception as e:
        # Log the full error for debugging on the server
        logging.error(f"An unexpected error occurred while scraping {target_url}: {str(e)}")        
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during scraping. Please check server logs.")

def extract_all_styles(soup, base_url):
    """Extract inline styles, style tags, and linked stylesheets"""
    all_css = []
    
    for style_tag in soup.find_all('style'):
        if style_tag.string:
            all_css.append(style_tag.string)
    
    for link in soup.find_all('link', rel='stylesheet'):
        href = link.get('href')
        if href:
            try:
                # Handle relative URLs
                if not href.startswith(('http://', 'https://')):
                    from urllib.parse import urljoin
                    href = urljoin(base_url, href)
                
                css_response = requests.get(href, timeout=5)
                if css_response.status_code == 200:
                    all_css.append(f"/* From {href} */\n{css_response.text}")
            except:
                pass
    
    return '\n'.join(all_css)

def preserve_dom_structure(element):
    """Convert BeautifulSoup element to dict preserving structure"""
    if isinstance(element, Tag):
        return {
            'tag': element.name,
            'attrs': dict(element.attrs),
            'text': element.get_text(strip=True),
            'children': [preserve_dom_structure(child) for child in element.children if isinstance(child, Tag)]
        }
    return None

@app.get(
    "/scrape-website",
    response_model=ScrapedPageInfo,
    summary="Scrape basic information from a website",
    description="Provide a URL and get back its title, H1 headings, and a sample of paragraphs.",
    tags=["Scraping"]
)
async def scrape_website_endpoint(
    url_to_scrape: HttpUrl = Query(..., description="The URL of the website to scrape (must be a valid HTTP/HTTPS URL)")
): 
    scraped_data = perform_scrape(str(url_to_scrape)) 
    return scraped_data

@app.post("/clone-website")
async def clone_website(request: ScrapeRequest):
    try:
        response = requests.get(request.url, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        title = soup.find('title').get_text(strip=True) if soup.find('title') else "Untitled"
        headings = [h.get_text(strip=True) for h in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])]
        paragraphs = [p.get_text(strip=True) for p in soup.find_all('p') if p.get_text(strip=True)]
        
        all_styles = extract_all_styles(soup, str(request.url))
        body = soup.find('body')
        dom_structure = preserve_dom_structure(body) if body else None

        inline_styles = []
        for element in soup.find_all(style=True):
            inline_styles.append({
                'tag': element.name,
                'id': element.get('id', ''),
                'class': ' '.join(element.get('class', [])),
                'style': element['style']
            })

        model = genai.GenerativeModel('gemini-2.5-flash-preview-05-20')
        
        prompt = CLONE_WEBSITE_PROMPT.format(
            url=str(request.url),
            title=title,
            headings=headings, 
            paragraphs=paragraphs,
            all_styles=all_styles,
            inline_styles=inline_styles,
            dom_structure=str(dom_structure)
        )

        response = model.generate_content(prompt)
        generated_html = response.text
        
        return {
            "success": True,
            "original_url": request.url,
            "generated_html": generated_html,
            "original_content": {
                "title": title,
                "headings": headings,
                "paragraphs": paragraphs
            }
        }
        
    except Exception as e:
        logging.error(f"Error in clone_website endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/")
def read_root():
    return {"message": "Hello World"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
