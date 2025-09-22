import re
from datetime import datetime
import spacy
import nltk
from nltk.tokenize import sent_tokenize
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Try to download required NLTK resources
try:
    nltk.download('punkt', quiet=True)
except:
    logger.warning("Could not download NLTK punkt. Sentence tokenization may be less accurate.")

# Try to load spaCy model - fallback to simpler methods if not available
try:
    nlp = spacy.load("en_core_web_sm")
    SPACY_AVAILABLE = True
except:
    logger.warning("spaCy model not available. Using simpler NLP methods.")
    SPACY_AVAILABLE = False

# Gaza-specific location data
GAZA_LOCATIONS = [
    "Gaza City", "Gaza Strip", "Rafah", "Khan Younis", "Jabalia", "Beit Lahiya",
    "Beit Hanoun", "Deir al-Balah", "Nuseirat", "Al-Shati", "Beach Camp",
    "Bureij", "Maghazi", "Northern Gaza", "Central Gaza", "Southern Gaza",
    "Jabalia Camp", "Shuja'iyya", "Zeitoun", "Tuffah", "Daraj", "Sabra"
]

# Incident classification keywords
INCIDENT_TYPES = {
    "casualties": ["killed", "died", "death", "fatality", "fatalities", "casualty", "casualties", "bodies",
                   "body count", "death toll"],
    "injuries": ["wounded", "injured", "injury", "injuries", "hurt", "maimed", "trauma", "wounded"],
    "infrastructure": ["hospital", "school", "mosque", "church", "building", "destroyed", "damaged", "infrastructure",
                       "facility", "bakery", "water", "sewage", "electricity", "power", "university"],
    "displacement": ["refugee", "displaced", "evacuation", "fled", "homeless", "shelter", "camp", "evacuated",
                     "evacuation order"],
    "hunger": ["hunger", "starvation", "malnourished", "malnutrition", "food crisis", "food shortage", "famine"],
    "water": ["water shortage", "clean water", "drinking water", "water system", "contaminated water", "water crisis"],
    "aid": ["aid", "humanitarian", "relief", "supplies", "blocked", "convoy", "donation", "assistance", "red cross",
            "unrwa", "red crescent"],
    "medical": ["medicine", "medical supplies", "doctor", "nurse", "hospital", "clinic", "surgeon", "healthcare",
                "patient", "ambulance", "paramedic"]
}

# Enhance date extraction with patterns common in news articles
DATE_PATTERNS = [
    # Standard date formats
    r'\d{1,2} [A-Za-z]+ \d{4}',  # 25 December 2023
    r'[A-Za-z]+ \d{1,2},? \d{4}',  # December 25, 2023
    r'\d{1,2}/\d{1,2}/\d{4}',  # 25/12/2023
    r'\d{4}-\d{1,2}-\d{1,2}',  # 2023-12-25

    # Relative dates
    r'(yesterday|today|this morning|last night|this evening)',

    # Day-of-week with context
    r'(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (morning|afternoon|evening|night)',

    # Complex date expressions
    r'(early|late|mid) [A-Za-z]+',  # early January, mid-December
    r'[A-Za-z]+ of \d{4}'  # March of 2023
]


def extract_dates(text):
    """Extract potential date references from text"""
    dates = []

    # Try to find dates using various patterns
    for pattern in DATE_PATTERNS:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            dates.append(match.group(0))

    # If no dates found, use current date
    if not dates:
        dates.append(datetime.now().strftime("%d %B %Y"))

    return dates[0]  # Return the first date found


def extract_locations(text):
    """Extract location mentions from text"""
    locations = []

    # Check for known Gaza locations
    for location in GAZA_LOCATIONS:
        if location.lower() in text.lower():
            locations.append(location)

    # Try spaCy NER if available
    if SPACY_AVAILABLE:
        doc = nlp(text)
        for ent in doc.ents:
            if ent.label_ == "GPE" or ent.label_ == "LOC":
                locations.append(ent.text)

    # Remove duplicates and return
    return list(set(locations))


def extract_casualties(text):
    """Extract casualty numbers from text"""
    casualties = {
        "deaths": None,
        "injured": None,
        "total": None
    }

    # Pattern for deaths
    death_patterns = [
        r'(\d+)(?:\s+people|\s+persons|\s+civilians|\s+children|\s+women|\s+men)?\s+(?:were\s+)?(?:killed|dead|died|death)',
        r'(?:killed|dead|died|death)(?:\s+toll\s+(?:reaches|reached))?\s+(\d+)',
        r'(?:death|killed)\s+(?:toll|count)(?:\s+(?:of|at|reached))?\s+(\d+)'
    ]

    # Pattern for injured
    injured_patterns = [
        r'(\d+)(?:\s+people|\s+persons|\s+civilians|\s+children|\s+women|\s+men)?\s+(?:were\s+)?(?:injured|wounded|hurt)',
        r'(?:injured|wounded)(?:\s+(?:reaches|reached))?\s+(\d+)',
    ]

    # Extract deaths
    for pattern in death_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            casualties["deaths"] = int(match.group(1))
            break

    # Extract injured
    for pattern in injured_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            casualties["injured"] = int(match.group(1))
            break

    # Calculate total if both values present
    if casualties["deaths"] is not None or casualties["injured"] is not None:
        deaths = casualties["deaths"] or 0
        injured = casualties["injured"] or 0
        casualties["total"] = deaths + injured

    return casualties


def determine_incident_type(text):
    """Determine the most likely incident type based on keyword matches"""
    scores = {incident_type: 0 for incident_type in INCIDENT_TYPES.keys()}

    # Count keyword occurrences for each incident type
    text_lower = text.lower()
    for incident_type, keywords in INCIDENT_TYPES.items():
        for keyword in keywords:
            if keyword.lower() in text_lower:
                scores[incident_type] += 1

    # Get the incident type with the highest score
    if max(scores.values()) > 0:
        return max(scores.items(), key=lambda x: x[1])[0]
    else:
        return "general"


def extract_incidents_from_paragraph(paragraph):
    """Extract incident information from a single paragraph"""
    if len(paragraph.strip()) < 30:
        return None  # Skip short paragraphs

    # Determine if this paragraph likely describes an incident
    incident_type = determine_incident_type(paragraph)
    if incident_type == "general":
        # Check if any incident-related keywords are present
        has_incident_keywords = any(
            keyword in paragraph.lower()
            for keywords in INCIDENT_TYPES.values()
            for keyword in keywords
        )
        if not has_incident_keywords:
            return None

    # Extract information
    date = extract_dates(paragraph)
    locations = extract_locations(paragraph)
    casualties = extract_casualties(paragraph)

    # Create incident object
    incident = {
        "type": incident_type,
        "description": paragraph.strip(),
        "date": date,
    }

    # Add location if found
    if locations:
        incident["location"] = locations[0]  # Primary location
        if len(locations) > 1:
            incident["additional_locations"] = locations[1:]

    # Add casualties if found
    if casualties["total"] is not None:
        incident["casualties"] = casualties

    return incident


def split_into_meaningful_chunks(text):
    """Split text into meaningful chunks (paragraphs or sentences)"""
    # First try to split by paragraphs
    paragraphs = text.split('\n\n')

    # If we got only one paragraph but it's long, split by sentences
    if len(paragraphs) <= 1 and len(text) > 300:
        return sent_tokenize(text)

    # Otherwise return paragraphs
    return [p for p in paragraphs if p.strip()]


def extract_incidents_from_text(text):
    """
    Enhanced function to extract potential incidents from provided text
    """
    if not text or len(text.strip()) < 50:
        logger.warning("Text too short for meaningful extraction")
        return []

    incidents = []
    logger.info(f"Processing text ({len(text)} characters)")

    # Split text into meaningful chunks
    chunks = split_into_meaningful_chunks(text)
    logger.info(f"Split text into {len(chunks)} chunks")

    # Process each chunk
    for chunk in chunks:
        incident = extract_incidents_from_paragraph(chunk)
        if incident:
            incidents.append(incident)

    logger.info(f"Extracted {len(incidents)} potential incidents")
    return incidents