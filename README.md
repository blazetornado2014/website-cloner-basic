# Orchids SWE Intern Challenge Template

This project consists of a backend built with FastAPI and a frontend built with Next.js and TypeScript.

## Backend

The backend uses `uv` for package management.

### Installation

To install the backend dependencies, run the following command in the backend project directory:

```bash
uv sync
```

### Running the Backend

To run the backend development server, use the following command:

```bash
uv run fastapi dev
```

## Frontend

The frontend is built with Next.js and TypeScript.

### Installation

To install the frontend dependencies, navigate to the frontend project directory and run:

```bash
npm install
```

### Running the Frontend

To start the frontend development server, run:

```bash
npm run dev
```

### LLM Support

This project works with the Gemini 2.5 Flash. Create an empty .env file at \orchids-challenge\backend\app which needs to be populated with an API key.

File content:
GEMINI_API_KEY=insert your api key here

To get your API key, follow this link and select Create API Key
https://aistudio.google.com/app/apikey 

### Features TBA
    - Image support
    - Sharper prompts and accurate results
    - Improved Web Scraping to tackle big websites like Youtube
    - JavaScript cloning, dynamic elements
