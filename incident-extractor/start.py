import subprocess
import sys
import nltk

# Download spaCy model
subprocess.check_call([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])

# Download NLTK data
nltk.download('punkt')
nltk.download('stopwords')

# Start the app with gunicorn
subprocess.call(["gunicorn", "app:app"])