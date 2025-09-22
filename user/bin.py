#!/usr/bin/env python3
"""
Gaza Crisis Documentation Scraper
Collects publicly available information about humanitarian conditions
Focus: Food security, water access, and population health data
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import re
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import csv
from urllib.parse import urljoin, urlparse
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('scraper.log'),
        logging.StreamHandler()
    ]
)


class GazaCrisisScraper:
    def __init__(self, delay=2.0):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        self.delay = delay  # Respectful delay between requests
        self.incidents = []

    def wait(self):
        """Respectful delay between requests"""
        time.sleep(self.delay)

    def scrape_un_ocha(self, days_back=30) -> List[Dict]:
        """Scrape UN OCHA humanitarian updates"""
        incidents = []
        base_url = "https://www.ochaopt.org"

        try:
            # Get recent situation reports
            response = self.session.get(f"{base_url}/content/hostilities-gaza-strip-and-israel-flash-updates")
            soup = BeautifulSoup(response.content, 'html.parser')

            # Find flash update links
            update_links = soup.find_all('a', href=re.compile(r'/content/.*flash.*update'))

            for link in update_links[:10]:  # Limit to recent updates
                self.wait()
                update_url = urljoin(base_url, link['href'])

                try:
                    update_response = self.session.get(update_url)
                    update_soup = BeautifulSoup(update_response.content, 'html.parser')

                    # Extract key information
                    title = update_soup.find('h1')
                    content = update_soup.find('div', class_='field-item')

                    if title and content:
                        text = content.get_text()

                        # Look for hunger/food security keywords
                        food_keywords = ['hunger', 'starvation', 'malnutrition', 'food security',
                                         'famine', 'food distribution', 'aid distribution']

                        if any(keyword.lower() in text.lower() for keyword in food_keywords):
                            incident = {
                                'id': f"ocha_{len(incidents)}",
                                'source': 'UN OCHA',
                                'title': title.get_text().strip(),
                                'description': self.extract_relevant_paragraphs(text, food_keywords),
                                'url': update_url,
                                'date': self.extract_date_from_text(text),
                                'location': 'Gaza Strip',
                                'category': 'Food Security',
                                'verified': True,
                                'evidence_type': 'Report'
                            }
                            incidents.append(incident)

                except Exception as e:
                    logging.error(f"Error scraping {update_url}: {e}")

        except Exception as e:
            logging.error(f"Error accessing UN OCHA: {e}")

        return incidents

    def scrape_who_health_data(self) -> List[Dict]:
        """Scrape WHO health situation reports"""
        incidents = []
        base_url = "https://www.who.int"

        try:
            # WHO emergencies page for Gaza
            response = self.session.get(f"{base_url}/emergencies/disease-outbreak-news")
            soup = BeautifulSoup(response.content, 'html.parser')

            # Find Gaza-related health reports
            gaza_links = soup.find_all('a', string=re.compile(r'Gaza|Palestine', re.I))

            for link in gaza_links[:5]:
                self.wait()
                report_url = urljoin(base_url, link['href'])

                try:
                    report_response = self.session.get(report_url)
                    report_soup = BeautifulSoup(report_response.content, 'html.parser')

                    content = report_soup.find('div', class_='sf-content-block')
                    if content:
                        text = content.get_text()

                        # Look for malnutrition and health indicators
                        health_keywords = ['malnutrition', 'undernutrition', 'mortality',
                                           'health system', 'medical supplies', 'children']

                        if any(keyword.lower() in text.lower() for keyword in health_keywords):
                            incident = {
                                'id': f"who_{len(incidents)}",
                                'source': 'WHO',
                                'title': report_soup.find('h1').get_text().strip(),
                                'description': self.extract_relevant_paragraphs(text, health_keywords),
                                'url': report_url,
                                'date': self.extract_date_from_text(text),
                                'location': 'Gaza Strip',
                                'category': 'Health',
                                'verified': True,
                                'evidence_type': 'Health Report'
                            }
                            incidents.append(incident)

                except Exception as e:
                    logging.error(f"Error scraping WHO report {report_url}: {e}")

        except Exception as e:
            logging.error(f"Error accessing WHO data: {e}")

        return incidents

    def scrape_wfp_food_security(self) -> List[Dict]:
        """Scrape World Food Programme reports"""
        incidents = []

        try:
            # WFP situation reports
            wfp_url = "https://www.wfp.org/countries/state-palestine"
            response = self.session.get(wfp_url)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Find relevant content sections
            content_sections = soup.find_all('div', class_=['content', 'field-item'])

            for section in content_sections:
                text = section.get_text()
                food_security_keywords = ['food security', 'hunger', 'malnutrition',
                                          'food assistance', 'nutrition']

                if any(keyword.lower() in text.lower() for keyword in food_security_keywords):
                    incident = {
                        'id': f"wfp_{len(incidents)}",
                        'source': 'WFP',
                        'title': 'Gaza Food Security Update',
                        'description': self.extract_relevant_paragraphs(text, food_security_keywords),
                        'url': wfp_url,
                        'date': datetime.now().strftime('%Y-%m-%d'),
                        'location': 'Gaza Strip',
                        'category': 'Food Security',
                        'verified': True,
                        'evidence_type': 'Assessment'
                    }
                    incidents.append(incident)

        except Exception as e:
            logging.error(f"Error scraping WFP data: {e}")

        return incidents

    def scrape_news_sources(self, sources: List[str]) -> List[Dict]:
        """Scrape news sources for Gaza crisis coverage"""
        incidents = []

        for source_url in sources:
            self.wait()
            try:
                response = self.session.get(source_url)
                soup = BeautifulSoup(response.content, 'html.parser')

                # Generic article extraction
                articles = soup.find_all(['article', 'div'], class_=re.compile(r'article|story|news'))

                for article in articles[:5]:
                    title_elem = article.find(['h1', 'h2', 'h3'])
                    content_elem = article.find(['p', 'div'], class_=re.compile(r'content|summary|excerpt'))

                    if title_elem and content_elem:
                        title = title_elem.get_text().strip()
                        content = content_elem.get_text().strip()

                        # Check for crisis-related keywords
                        crisis_keywords = ['gaza', 'hunger', 'starvation', 'aid', 'humanitarian']

                        if any(keyword.lower() in (title + content).lower() for keyword in crisis_keywords):
                            incident = {
                                'id': f"news_{len(incidents)}",
                                'source': urlparse(source_url).netloc,
                                'title': title,
                                'description': content[:500] + '...' if len(content) > 500 else content,
                                'url': source_url,
                                'date': datetime.now().strftime('%Y-%m-%d'),
                                'location': 'Gaza Strip',
                                'category': 'News Report',
                                'verified': False,  # News requires verification
                                'evidence_type': 'Media Report'
                            }
                            incidents.append(incident)

            except Exception as e:
                logging.error(f"Error scraping {source_url}: {e}")

        return incidents

    def extract_relevant_paragraphs(self, text: str, keywords: List[str], max_chars=800) -> str:
        """Extract paragraphs containing relevant keywords"""
        paragraphs = text.split('\n')
        relevant = []

        for para in paragraphs:
            if any(keyword.lower() in para.lower() for keyword in keywords):
                relevant.append(para.strip())

        result = ' '.join(relevant)
        return result[:max_chars] + '...' if len(result) > max_chars else result

    def extract_date_from_text(self, text: str) -> str:
        """Extract date from text content"""
        # Common date patterns
        date_patterns = [
            r'\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}',
            r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}',
            r'\d{4}-\d{2}-\d{2}',
            r'\d{1,2}/\d{1,2}/\d{4}'
        ]

        for pattern in date_patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(0)

        return datetime.now().strftime('%Y-%m-%d')

    def generate_coordinates(self, location: str) -> tuple:
        """Generate approximate coordinates for Gaza locations"""
        gaza_locations = {
            'gaza city': (31.5017, 34.4668),
            'khan younis': (31.3490, 34.3088),
            'rafah': (31.2996, 34.2392),
            'jabalia': (31.5317, 34.4833),
            'beit lahia': (31.5453, 34.5042),
            'gaza strip': (31.4167, 34.3333)  # Central Gaza
        }

        location_lower = location.lower()
        for key, coords in gaza_locations.items():
            if key in location_lower:
                return coords

        return (31.4167, 34.3333)  # Default to central Gaza

    def export_to_json(self, filename='incidents.json'):
        """Export collected data to JSON format for your platform"""
        # Add coordinates to all incidents
        for incident in self.incidents:
            lat, lng = self.generate_coordinates(incident.get('location', 'Gaza Strip'))
            incident['coordinates'] = {'lat': lat, 'lng': lng}

        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'incidents': self.incidents,
                'last_updated': datetime.now().isoformat(),
                'total_count': len(self.incidents)
            }, f, indent=2, ensure_ascii=False)

        logging.info(f"Exported {len(self.incidents)} incidents to {filename}")

    def export_to_csv(self, filename='incidents.csv'):
        """Export to CSV format"""
        if not self.incidents:
            return

        fieldnames = ['id', 'source', 'title', 'description', 'url', 'date',
                      'location', 'category', 'verified', 'evidence_type', 'coordinates']

        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for incident in self.incidents:
                # Flatten coordinates for CSV
                row = incident.copy()
                if 'coordinates' in row:
                    row['coordinates'] = f"{row['coordinates']['lat']},{row['coordinates']['lng']}"
                writer.writerow(row)

        logging.info(f"Exported {len(self.incidents)} incidents to {filename}")

    def run_full_scrape(self):
        """Execute full scraping process"""
        logging.info("Starting Gaza Crisis data collection...")

        # Collect from various sources
        logging.info("Collecting UN OCHA reports...")
        self.incidents.extend(self.scrape_un_ocha())

        logging.info("Collecting WHO health data...")
        self.incidents.extend(self.scrape_who_health_data())

        logging.info("Collecting WFP food security data...")
        self.incidents.extend(self.scrape_wfp_food_security())

        # Add reputable news sources
        news_sources = [
            "https://www.reuters.com/world/middle-east/",
            "https://apnews.com/hub/israel-palestinians",
            "https://www.bbc.com/news/topics/c207p54m4wpt/israel-gaza"
        ]

        logging.info("Collecting news reports...")
        self.incidents.extend(self.scrape_news_sources(news_sources))

        # Remove duplicates based on title similarity
        self.incidents = self.remove_duplicates()

        logging.info(f"Collection complete. Total incidents: {len(self.incidents)}")

        # Export data
        self.export_to_json()
        self.export_to_csv()

    def remove_duplicates(self) -> List[Dict]:
        """Remove duplicate incidents based on title similarity"""
        unique_incidents = []
        seen_titles = set()

        for incident in self.incidents:
            title_words = set(incident['title'].lower().split())
            is_duplicate = False

            for seen_title in seen_titles:
                seen_words = set(seen_title.split())
                # If 70% of words overlap, consider it duplicate
                if len(title_words & seen_words) / len(title_words | seen_words) > 0.7:
                    is_duplicate = True
                    break

            if not is_duplicate:
                unique_incidents.append(incident)
                seen_titles.add(incident['title'].lower())

        return unique_incidents


def main():
    """Main execution function"""
    scraper = GazaCrisisScraper(delay=2.0)

    try:
        scraper.run_full_scrape()
        print(f"\nData collection completed successfully!")
        print(f"Total incidents collected: {len(scraper.incidents)}")
        print(f"Files generated: incidents.json, incidents.csv")
        print(f"Log file: scraper.log")

    except KeyboardInterrupt:
        print("\nScraping interrupted by user")
    except Exception as e:
        logging.error(f"Fatal error: {e}")
        print(f"Error occurred: {e}")


if __name__ == "__main__":
    main()