import requests
from bs4 import BeautifulSoup
import csv
import json
import yaml
import logging
from datetime import datetime
import os
import re
from urllib.parse import urljoin, urlparse
import time


class GazaCrisisExtractor:
    def __init__(self, config_path='config.yaml'):
        """Initialize the Gaza Crisis Data Extractor"""
        self.config = self.load_config(config_path)
        self.setup_logging()
        self.setup_directories()

    def load_config(self, config_path):
        """Load configuration from YAML file"""
        try:
            with open(config_path, 'r', encoding='utf-8') as file:
                return yaml.safe_load(file)
        except FileNotFoundError:
            # Default configuration if file doesn't exist
            return {
                'extraction': {
                    'delay_between_requests': 2,
                    'timeout': 30,
                    'max_retries': 3
                },
                'output': {
                    'csv_filename': 'gaza_crisis_data.csv',
                    'backup_enabled': True
                },
                'logging': {
                    'level': 'INFO',
                    'filename': 'extraction.log'
                }
            }

    def setup_logging(self):
        """Setup logging configuration"""
        log_level = getattr(logging, self.config['logging']['level'])
        log_filename = os.path.join('data_files/extraction_logs', self.config['logging']['filename'])

        logging.basicConfig(
            level=log_level,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_filename, encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)

    def setup_directories(self):
        """Create necessary directories if they don't exist"""
        directories = [
            'data_files',
            'data_files/backups',
            'data_files/daily_reports',
            'data_files/extraction_logs'
        ]
        for directory in directories:
            os.makedirs(directory, exist_ok=True)

    def extract_article_data(self, url):
        """Extract data from a single article URL"""
        self.logger.info(f"Extracting data from: {url}")

        try:
            # Make request with headers to appear like a real browser
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }

            response = requests.get(
                url,
                headers=headers,
                timeout=self.config['extraction']['timeout']
            )
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            # Extract article data based on Al Jazeera structure
            data = self.parse_aljazeera_article(soup, url)

            # Add extraction metadata
            data['extraction_timestamp'] = datetime.utcnow().isoformat()
            data['source_url'] = url

            self.logger.info(f"Successfully extracted data from: {url}")
            return data

        except requests.RequestException as e:
            self.logger.error(f"Request failed for {url}: {str(e)}")
            return None
        except Exception as e:
            self.logger.error(f"Extraction failed for {url}: {str(e)}")
            return None

    def parse_aljazeera_article(self, soup, url):
        """Parse Al Jazeera article structure with enhanced content extraction"""
        data = {
            'id': self.generate_incident_id(url),
            'title': '',
            'date': '',
            'time': '',
            'location_name': '',
            'location_coordinates_lat': '',
            'location_coordinates_lng': '',
            'type': '',
            'description': '',
            'casualties_affected': 0,
            'casualties_critical': 0,
            'casualties_deaths': 0,
            'casualties_injured': 0,
            'casualties_hospitalized': 0,
            'evidence_types': '',
            'evidence_urls': '',
            'evidence_descriptions': '',
            'sources': '',
            'verified': 'pending',
            'tags': '',
            'last_updated': datetime.utcnow().isoformat(),
            'casualties_details_count': 0,
            'casualties_details_ids': ''
        }

        # Extract title with multiple selectors
        title_selectors = [
            'h1',
            'h1.article-title',
            '[data-testid="post-title"]',
            '.article-header h1',
            'title'
        ]

        for selector in title_selectors:
            title_elem = soup.select_one(selector)
            if title_elem and title_elem.get_text().strip():
                data['title'] = self.clean_text(title_elem.get_text().strip())
                break

        # Extract date and time with multiple approaches
        date_selectors = [
            'time[datetime]',
            'time',
            '[data-testid="post-date"]',
            '.article-date',
            '.date',
            'span[class*="date"]'
        ]

        for selector in date_selectors:
            date_elem = soup.select_one(selector)
            if date_elem:
                date_text = date_elem.get('datetime') or date_elem.get_text()
                if date_text:
                    parsed_date = self.parse_date_time(date_text)
                    if parsed_date:
                        data['date'] = parsed_date['date']
                        data['time'] = parsed_date['time']
                        break

        # Enhanced content extraction with multiple selectors
        content_selectors = [
            'div[data-component="ArticleBody"]',
            'div.article-body',
            'div.wysiwyg',
            'div.content',
            'article div.text',
            'main article',
            '.post-content',
            '[data-testid="post-content"]'
        ]

        content_text = ""
        for selector in content_selectors:
            content_elem = soup.select_one(selector)
            if content_elem:
                # Get all paragraphs within the content
                paragraphs = content_elem.find_all(['p', 'div'], string=True)
                if paragraphs:
                    content_text = ' '.join([p.get_text(strip=True) for p in paragraphs])
                else:
                    content_text = content_elem.get_text(separator=' ', strip=True)

                if content_text and len(content_text) > 50:  # Ensure we got substantial content
                    break

        # If specific selectors fail, try getting all paragraphs
        if not content_text or len(content_text) < 50:
            paragraphs = soup.find_all('p')
            if paragraphs:
                content_text = ' '.join(
                    [p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 20])

        # Final fallback: get all text from body
        if not content_text:
            body = soup.find('body')
            if body:
                content_text = body.get_text(separator=' ', strip=True)

        data['description'] = self.clean_text(content_text)[:2000]  # Increased limit for better context

        # Extract location from title and content
        location = self.extract_location(data['title'], data['description'])
        data['location_name'] = location

        # Enhanced casualty extraction from both title and description
        full_text = f"{data['title']} {data['description']}"
        casualties = self.extract_casualties_from_text(full_text)
        data.update(casualties)

        # Determine incident type based on content
        data['type'] = self.classify_incident_type(data['title'], data['description'])

        # Extract tags based on content
        data['tags'] = self.extract_tags(data['title'], data['description'])

        # Set source as Al Jazeera
        data['sources'] = 'Al Jazeera'

        # Set as verified since it's from a credible news source
        data['verified'] = 'verified'

        # Debug logging
        self.logger.info(f"Extracted title: {data['title']}")
        self.logger.info(f"Content length: {len(data['description'])}")
        self.logger.info(f"Casualties found: {casualties}")

        return data

    def generate_incident_id(self, url):
        """Generate unique incident ID from URL"""
        # Extract meaningful part from URL
        parsed_url = urlparse(url)
        path_parts = parsed_url.path.strip('/').split('/')

        # Use date and article identifier
        if len(path_parts) >= 4:  # Expected: /news/YYYY/M/DD/article-name
            try:
                year = int(path_parts[1]) if path_parts[1].isdigit() else datetime.now().year
                month = int(path_parts[2]) if path_parts[2].isdigit() else datetime.now().month
                day = int(path_parts[3]) if path_parts[3].isdigit() else datetime.now().day

                # Create ID format: gaza-YYYY-MM-DD-XXX
                incident_id = f"gaza-{year}-{month:02d}-{day:02d}-{abs(hash(url)) % 1000:03d}"
            except (ValueError, IndexError):
                # Fallback if path parsing fails
                incident_id = f"gaza-{datetime.now().strftime('%Y-%m-%d')}-{abs(hash(url)) % 1000:03d}"
        else:
            # Fallback ID generation
            incident_id = f"gaza-{datetime.now().strftime('%Y-%m-%d')}-{abs(hash(url)) % 1000:03d}"

        return incident_id

    def parse_date_time(self, date_text):
        """Parse date and time from various formats"""
        try:
            if not date_text or not isinstance(date_text, str):
                # Use current date/time if no valid date text
                now = datetime.now()
                return {
                    'date': now.strftime('%Y-%m-%d'),
                    'time': now.strftime('%H:%M:%S')
                }

            # Clean the date text
            date_text = date_text.strip()

            # Common date formats
            formats = [
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%dT%H:%M:%SZ',
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%d',
                '%d %B %Y',
                '%B %d, %Y',
                '%d/%m/%Y',
                '%m/%d/%Y'
            ]

            for fmt in formats:
                try:
                    # Take only the part of the string that matches the format length
                    if 'T' in fmt:
                        test_text = date_text[:19]  # ISO format length
                    else:
                        test_text = date_text

                    dt = datetime.strptime(test_text, fmt)
                    return {
                        'date': dt.strftime('%Y-%m-%d'),
                        'time': dt.strftime('%H:%M:%S') if '%H' in fmt else '12:00:00'
                    }
                except ValueError:
                    continue

            # If no format matches, use current date
            now = datetime.now()
            return {
                'date': now.strftime('%Y-%m-%d'),
                'time': now.strftime('%H:%M:%S')
            }

        except Exception as e:
            self.logger.warning(f"Date parsing failed for '{date_text}': {str(e)}")
            now = datetime.now()
            return {
                'date': now.strftime('%Y-%m-%d'),
                'time': now.strftime('%H:%M:%S')
            }

    def extract_location(self, title, description):
        """Extract location information from title and content"""
        # Common Gaza locations
        gaza_locations = [
            'Gaza City', 'Gaza', 'Rafah', 'Khan Younis', 'Khan Yunis', 'Deir al-Balah',
            'Beit Hanoun', 'Beit Lahia', 'Jabalia', 'Jabaliya', 'Shejaiya', 'Zeitoun',
            'Al-Maghazi', 'Al-Bureij', 'Nuseirat', 'Al-Zahra', 'Tal al-Hawa'
        ]

        text = f"{title} {description}".lower()

        for location in gaza_locations:
            if location.lower() in text:
                return location

        # Default to Gaza if no specific location found
        return 'Gaza'

    def extract_casualties_from_text(self, text):
        """Enhanced casualty extraction from text"""
        casualties = {
            'casualties_affected': 0,
            'casualties_critical': 0,
            'casualties_deaths': 0,
            'casualties_injured': 0,
            'casualties_hospitalized': 0
        }

        if not text:
            return casualties

        text_lower = text.lower()

        # Enhanced patterns for different casualty types
        patterns = {
            'casualties_deaths': [
                r'(\d+).*?(?:killed|dead|deaths?|died|fatalities)',
                r'(?:killed|dead|deaths?|died|fatalities).*?(\d+)',
                r'(\d+).*?(?:people|persons|individuals).*?(?:killed|dead|died)',
                r'(?:killing|killed).*?(\d+)',
                r'(\d+).*?journalists.*?(?:killed|dead)',
                r'(?:among|including).*?(\d+).*?(?:killed|dead)',
                r'death.*?toll.*?(\d+)',
                r'(\d+).*?(?:have been|were).*?killed'
            ],
            'casualties_injured': [
                r'(\d+).*?(?:injured|wounded|hurt)',
                r'(?:injured|wounded|hurt).*?(\d+)',
                r'(\d+).*?(?:people|persons).*?(?:injured|wounded)',
                r'(?:injuring|wounding).*?(\d+)'
            ],
            'casualties_hospitalized': [
                r'(\d+).*?(?:hospitalized|admitted|taken to hospital)',
                r'(?:hospitalized|admitted|taken to hospital).*?(\d+)'
            ]
        }

        # Special handling for journalist casualties
        journalist_patterns = [
            r'(\d+).*?(?:al.?jazeera|journalist|reporter|media).*?(?:killed|dead)',
            r'(?:al.?jazeera|journalist|reporter|media).*?(\d+).*?(?:killed|dead)',
            r'(\d+).*?(?:killed|dead).*?(?:al.?jazeera|journalist|reporter|media)',
            r'(?:among|including).*?(\d+).*?(?:al.?jazeera|journalist)',
            r'(\d+).*?(?:journalists|reporters|media personnel).*?(?:killed|dead)'
        ]

        # Check for journalist casualties first
        for pattern in journalist_patterns:
            matches = re.findall(pattern, text_lower, re.IGNORECASE)
            if matches:
                try:
                    num = max([int(match) for match in matches if match.isdigit()])
                    casualties['casualties_deaths'] = max(casualties['casualties_deaths'], num)
                    self.logger.info(f"Found journalist casualties: {num}")
                except (ValueError, TypeError):
                    continue

        # Then check for general casualty patterns
        for casualty_type, pattern_list in patterns.items():
            max_found = 0
            for pattern in pattern_list:
                matches = re.findall(pattern, text_lower, re.IGNORECASE)
                if matches:
                    try:
                        numbers = [int(match) for match in matches if str(match).isdigit()]
                        if numbers:
                            max_found = max(max_found, max(numbers))
                    except (ValueError, TypeError):
                        continue

            if max_found > 0:
                casualties[casualty_type] = max(casualties[casualty_type], max_found)
                self.logger.info(f"Found {casualty_type}: {max_found}")

        # Set affected as maximum of all casualty types
        casualties['casualties_affected'] = max(
            casualties['casualties_deaths'],
            casualties['casualties_injured'],
            casualties['casualties_hospitalized']
        )

        # Special case: if we found deaths but no affected, set affected to deaths
        if casualties['casualties_deaths'] > 0 and casualties['casualties_affected'] == 0:
            casualties['casualties_affected'] = casualties['casualties_deaths']

        return casualties

    def classify_incident_type(self, title, description):
        """Classify incident type based on content"""
        text = f"{title} {description}".lower()

        # Classification keywords
        classifications = {
            'casualties': ['killed', 'dead', 'death', 'casualties', 'bombing', 'strike', 'attack', 'journalist',
                           'reporter'],
            'hunger': ['starvation', 'malnutrition', 'hunger', 'food', 'famine'],
            'water': ['water', 'thirst', 'dehydration'],
            'aid': ['aid', 'humanitarian', 'relief', 'supplies'],
            'infrastructure': ['hospital', 'school', 'building', 'destroyed', 'damage']
        }

        for incident_type, keywords in classifications.items():
            if any(keyword in text for keyword in keywords):
                return incident_type

        return 'casualties'  # Default type

    def extract_tags(self, title, description):
        """Extract relevant tags from content"""
        text = f"{title} {description}".lower()
        tags = []

        # Tag keywords
        tag_keywords = {
            'children': ['child', 'children', 'kid', 'baby', 'infant'],
            'journalist': ['journalist', 'reporter', 'media', 'press', 'al jazeera'],
            'medical': ['doctor', 'nurse', 'medical', 'health', 'hospital'],
            'civilian': ['civilian', 'resident', 'family'],
            'airstrike': ['airstrike', 'bombing', 'bomb', 'missile', 'strike'],
            'artillery': ['artillery', 'shell', 'shelling'],
            'evacuation': ['evacuation', 'flee', 'escape', 'displaced']
        }

        for tag, keywords in tag_keywords.items():
            if any(keyword in text for keyword in keywords):
                tags.append(tag)

        return '|'.join(tags) if tags else 'general'

    def clean_text(self, text):
        """Clean and normalize text"""
        if not text:
            return ''

        # Remove extra whitespace and newlines
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()

        # Remove special characters that might break CSV
        text = text.replace('"', "'").replace('\n', ' ').replace('\r', ' ')

        return text

    def save_to_csv(self, data_list, filename=None):
        """Save extracted data to CSV file"""
        if not data_list:
            self.logger.warning("No data to save")
            return False

        if filename is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"data_files/daily_reports/gaza_crisis_extraction_{timestamp}.csv"

        try:
            # CSV headers matching the incidents.csv structure
            headers = [
                'id', 'title', 'date', 'time', 'location_name',
                'location_coordinates_lat', 'location_coordinates_lng',
                'type', 'description', 'casualties_affected', 'casualties_critical',
                'casualties_deaths', 'casualties_injured', 'casualties_hospitalized',
                'evidence_types', 'evidence_urls', 'evidence_descriptions',
                'sources', 'verified', 'tags', 'last_updated',
                'casualties_details_count', 'casualties_details_ids'
            ]

            with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=headers)
                writer.writeheader()

                for data in data_list:
                    # Ensure all required fields are present
                    row = {header: data.get(header, '') for header in headers}
                    writer.writerow(row)

            self.logger.info(f"Data saved to {filename}")

            # Create backup if enabled
            if self.config['output']['backup_enabled']:
                self.create_backup(filename)

            return True

        except Exception as e:
            self.logger.error(f"Failed to save CSV: {str(e)}")
            return False

    def create_backup(self, filename):
        """Create backup of the CSV file"""
        try:
            import shutil
            backup_filename = filename.replace('daily_reports', 'backups')
            backup_filename = backup_filename.replace('.csv', f'_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv')

            os.makedirs(os.path.dirname(backup_filename), exist_ok=True)
            shutil.copy2(filename, backup_filename)

            self.logger.info(f"Backup created: {backup_filename}")

        except Exception as e:
            self.logger.error(f"Failed to create backup: {str(e)}")

    def extract_from_urls(self, urls):
        """Extract data from multiple URLs"""
        if isinstance(urls, str):
            urls = [urls]

        extracted_data = []

        for i, url in enumerate(urls):
            self.logger.info(f"Processing URL {i + 1}/{len(urls)}: {url}")

            data = self.extract_article_data(url)
            if data:
                extracted_data.append(data)

            # Delay between requests to be respectful
            if i < len(urls) - 1:
                time.sleep(self.config['extraction']['delay_between_requests'])

        return extracted_data

    def update_main_csv(self, new_data, main_csv_path='incidents.csv'):
        """Update the main incidents.csv file with new data"""
        try:
            existing_data = []
            existing_ids = set()

            # Read existing data if file exists
            if os.path.exists(main_csv_path):
                with open(main_csv_path, 'r', encoding='utf-8') as csvfile:
                    reader = csv.DictReader(csvfile)
                    for row in reader:
                        existing_data.append(row)
                        existing_ids.add(row['id'])

            # Add new data (avoiding duplicates)
            new_entries = 0
            for data in new_data:
                if data['id'] not in existing_ids:
                    existing_data.append(data)
                    existing_ids.add(data['id'])
                    new_entries += 1

            # Save updated data
            if self.save_to_csv(existing_data, main_csv_path):
                self.logger.info(f"Updated main CSV with {new_entries} new entries")
                return True

            return False

        except Exception as e:
            self.logger.error(f"Failed to update main CSV: {str(e)}")
            return False


def main():
    """Main function for command line usage"""
    import argparse

    parser = argparse.ArgumentParser(description='Gaza Crisis Data Extractor')
    parser.add_argument('urls', nargs='+', help='URLs to extract data from')
    parser.add_argument('--config', default='config.yaml', help='Config file path')
    parser.add_argument('--output', help='Output CSV file path')
    parser.add_argument('--update-main', action='store_true', help='Update main incidents.csv file')

    args = parser.parse_args()

    # Initialize extractor
    extractor = GazaCrisisExtractor(args.config)

    # Extract data
    print(f"Extracting data from {len(args.urls)} URL(s)...")
    extracted_data = extractor.extract_from_urls(args.urls)

    if extracted_data:
        print(f"Successfully extracted data from {len(extracted_data)} articles")

        # Save data
        if args.output:
            extractor.save_to_csv(extracted_data, args.output)
        else:
            extractor.save_to_csv(extracted_data)

        # Update main CSV if requested
        if args.update_main:
            extractor.update_main_csv(extracted_data)

        print("Data extraction completed successfully!")

        # Print extracted data for debugging
        for data in extracted_data:
            print(f"\nExtracted incident: {data['id']}")
            print(f"Title: {data['title']}")
            print(f"Deaths: {data['casualties_deaths']}")
            print(f"Description length: {len(data['description'])}")
    else:
        print("No data was extracted. Check the logs for details.")


if __name__ == "__main__":
    main()