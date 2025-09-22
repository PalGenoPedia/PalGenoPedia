import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin, urlparse
import logging


class URLProcessor:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })

    def validate_url(self, url):
        """Validate if URL is accessible and returns content"""
        try:
            response = self.session.head(url, timeout=10, allow_redirects=True)
            return {
                'valid': response.status_code == 200,
                'status_code': response.status_code,
                'content_type': response.headers.get('content-type', ''),
                'final_url': response.url
            }
        except Exception as e:
            return {
                'valid': False,
                'error': str(e),
                'status_code': None
            }

    def extract_article_urls(self, base_url, max_pages=5):
        """Extract article URLs from a news site"""
        urls = []

        try:
            if 'aljazeera.com' in base_url:
                urls = self._extract_aljazeera_urls(base_url, max_pages)
            elif 'bbc.com' in base_url:
                urls = self._extract_bbc_urls(base_url, max_pages)
            else:
                # Generic extraction
                urls = self._extract_generic_urls(base_url, max_pages)

            # Remove duplicates and validate
            unique_urls = list(set(urls))
            validated_urls = []

            for url in unique_urls:
                validation = self.validate_url(url)
                if validation['valid']:
                    validated_urls.append(url)

            return validated_urls

        except Exception as e:
            self.logger.error(f"Failed to extract URLs from {base_url}: {str(e)}")
            return []

    def _extract_aljazeera_urls(self, base_url, max_pages):
        """Extract URLs from Al Jazeera news site"""
        urls = []

        try:
            # Get the main page
            response = self.session.get(base_url, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            # Find article links
            article_selectors = [
                'a[href*="/news/"]',
                'a[href*="/features/"]',
                'a[href*="/opinions/"]',
                '.article-card a',
                '.post-title a'
            ]

            for selector in article_selectors:
                links = soup.select(selector)
                for link in links:
                    href = link.get('href')
                    if href:
                        # Convert relative URLs to absolute
                        if href.startswith('/'):
                            href = urljoin(base_url, href)

                        # Filter for Gaza-related content
                        if self._is_gaza_related(href, link.get_text()):
                            urls.append(href)

            return urls[:50]  # Limit to 50 URLs per extraction

        except Exception as e:
            self.logger.error(f"Failed to extract Al Jazeera URLs: {str(e)}")
            return []

    def _extract_bbc_urls(self, base_url, max_pages):
        """Extract URLs from BBC news site"""
        urls = []

        try:
            response = self.session.get(base_url, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            # Find article links
            article_selectors = [
                'a[href*="/news/"]',
                'a[href*="/world/"]',
                '.media__link',
                '.gs-c-promo-heading'
            ]

            for selector in article_selectors:
                links = soup.select(selector)
                for link in links:
                    href = link.get('href')
                    if href:
                        if href.startswith('/'):
                            href = urljoin(base_url, href)

                        if self._is_gaza_related(href, link.get_text()):
                            urls.append(href)

            return urls[:50]

        except Exception as e:
            self.logger.error(f"Failed to extract BBC URLs: {str(e)}")
            return []

    def _extract_generic_urls(self, base_url, max_pages):
        """Generic URL extraction for other news sites"""
        urls = []

        try:
            response = self.session.get(base_url, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            # Generic selectors for article links
            article_selectors = [
                'a[href*="article"]',
                'a[href*="news"]',
                'a[href*="story"]',
                'article a',
                '.post a',
                '.news-item a'
            ]

            for selector in article_selectors:
                links = soup.select(selector)
                for link in links:
                    href = link.get('href')
                    if href:
                        if href.startswith('/'):
                            href = urljoin(base_url, href)

                        if self._is_gaza_related(href, link.get_text()):
                            urls.append(href)

            return urls[:50]

        except Exception as e:
            self.logger.error(f"Failed to extract generic URLs: {str(e)}")
            return []

    def _is_gaza_related(self, url, text):
        """Check if URL/text is related to Gaza"""
        gaza_keywords = [
            'gaza', 'palestine', 'palestinian', 'israel', 'israeli',
            'rafah', 'khan younis', 'jabalia', 'deir al-balah',
            'hamas', 'idf', 'west bank', 'jerusalem'
        ]

        # Check URL
        url_lower = url.lower()
        for keyword in gaza_keywords:
            if keyword in url_lower:
                return True

        # Check text content
        if text:
            text_lower = text.lower()
            for keyword in gaza_keywords:
                if keyword in text_lower:
                    return True

        return False

    def extract_images_from_article(self, url):
        """Extract images from an article URL"""
        try:
            response = self.session.get(url, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            images = []
            img_tags = soup.find_all('img')

            for img in img_tags:
                src = img.get('src') or img.get('data-src')
                if src:
                    # Convert relative URLs to absolute
                    if src.startswith('/'):
                        src = urljoin(url, src)

                    # Get alt text and caption
                    alt_text = img.get('alt', '')
                    caption = ''

                    # Try to find caption
                    parent = img.parent
                    if parent:
                        caption_elem = parent.find('figcaption') or parent.find('caption')
                        if caption_elem:
                            caption = caption_elem.get_text().strip()

                    images.append({
                        'url': src,
                        'alt_text': alt_text,
                        'caption': caption
                    })

            return images

        except Exception as e:
            self.logger.error(f"Failed to extract images from {url}: {str(e)}")
            return []

    def batch_validate_urls(self, urls):
        """Validate multiple URLs in batch"""
        results = []

        for url in urls:
            validation = self.validate_url(url)
            results.append({
                'url': url,
                'valid': validation['valid'],
                'status_code': validation.get('status_code'),
                'error': validation.get('error')
            })

        return results

    def clean_url(self, url):
        """Clean and normalize URL"""
        # Remove tracking parameters
        tracking_params = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'fbclid', 'gclid', 'ref', 'source'
        ]

        parsed = urlparse(url)
        query_params = []

        if parsed.query:
            for param in parsed.query.split('&'):
                if '=' in param:
                    key, value = param.split('=', 1)
                    if key not in tracking_params:
                        query_params.append(param)

        # Rebuild URL
        clean_query = '&'.join(query_params)
        clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

        if clean_query:
            clean_url += f"?{clean_query}"

        if parsed.fragment:
            clean_url += f"#{parsed.fragment}"

        return clean_url


def main():
    """Command line usage example"""
    import argparse

    parser = argparse.ArgumentParser(description='URL Processor for Gaza Crisis Data')
    parser.add_argument('--extract-urls', help='Extract article URLs from a news site')
    parser.add_argument('--validate-url', help='Validate a single URL')
    parser.add_argument('--extract-images', help='Extract images from an article URL')

    args = parser.parse_args()

    processor = URLProcessor()

    if args.extract_urls:
        print(f"Extracting URLs from: {args.extract_urls}")
        urls = processor.extract_article_urls(args.extract_urls)
        print(f"Found {len(urls)} Gaza-related URLs:")
        for url in urls:
            print(f"  - {url}")

    elif args.validate_url:
        print(f"Validating URL: {args.validate_url}")
        result = processor.validate_url(args.validate_url)
        print(f"Valid: {result['valid']}")
        if not result['valid']:
            print(f"Error: {result.get('error', 'Unknown error')}")

    elif args.extract_images:
        print(f"Extracting images from: {args.extract_images}")
        images = processor.extract_images_from_article(args.extract_images)
        print(f"Found {len(images)} images:")
        for img in images:
            print(f"  - {img['url']}")
            if img['caption']:
                print(f"    Caption: {img['caption']}")


if __name__ == "__main__":
    main()