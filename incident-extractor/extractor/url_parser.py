import requests
import re
from bs4 import BeautifulSoup
from .text_parser import extract_incidents_from_text


def extract_incidents_from_url(url):
    """
    Fetch a URL and extract incidents from its content
    """
    try:
        # Fetch the URL
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        # Parse HTML
        soup = BeautifulSoup(response.text, 'html.parser')

        # Extract main article content - this is simplified and will need customization for different sites
        # Try to find article content based on common patterns
        article_content = ""

        # Try finding by article tag
        article = soup.find('article')
        if article:
            article_content = article.get_text()
        else:
            # Try common content div class names
            content_divs = soup.find_all(['div', 'section'], class_=[
                'content', 'article-content', 'story-content', 'entry-content', 'post-content', 'main-content'
            ])

            if content_divs:
                article_content = content_divs[0].get_text()
            else:
                # Fallback: extract all paragraph text
                paragraphs = soup.find_all('p')
                article_content = "\n\n".join([p.get_text() for p in paragraphs])

        # Clean up the text
        article_content = article_content.replace('\t', ' ').strip()
        article_content = re.sub(r'\n{3,}', '\n\n', article_content)

        # Get the source
        source = url.split('//')[1].split('/')[0]

        # Extract incidents using text parser
        incidents = extract_incidents_from_text(article_content)

        # Add source to each incident
        for incident in incidents:
            incident['sources'] = source

        return incidents

    except Exception as e:
        print(f"Error extracting content from URL: {e}")
        return [{"error": str(e), "description": f"Failed to process URL: {url}"}]