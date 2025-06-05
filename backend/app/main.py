from fastapi import FastAPI, HTTPException, Query;
from fastapi.middleware.cors import CORSMiddleware
import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, HttpUrl
from typing import List, Optional
import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

CLONE_WEBSITE_PROMPT = """
You are an expert web developer who replicates websites with 100% accuracy. Your current task is to clone a website's content and structure into a new HTML document. The goal is to create the same exact website layout with the content provided to you. You will receive the title, headings, and paragraphs from the original website. Your output should be a complete HTML document that replicates the original website's content and structure.
You have access to the original website's URL as well. Access the website and see how it is structured to replicate it accurately.
If you need to access images or other resources, assume they are hosted at the same domain as the original URL and fetch them. If image cannot be retrieved, use placeholder image / icon.

Requirements:
- Keep the same content structure and hierarchy
- Ensure all the content is displayed correctly

Website checklist to clone:
Title: {title}
Headings: {headings}
Paragraphs: {paragraphs}

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
        print(f"An unexpected error occurred while scraping {target_url}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during scraping. Please check server logs.")


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
        
        model = genai.GenerativeModel('gemini-2.5-flash-preview-05-20')
        
        prompt = CLONE_WEBSITE_PROMPT.format(
            title=title,
            headings=headings, 
            paragraphs=paragraphs  
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
        print(e)
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/")
def read_root():
    return {"message": "Hello World"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
