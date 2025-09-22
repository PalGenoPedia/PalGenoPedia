from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from extractor.text_parser import extract_incidents_from_text
from extractor.url_parser import extract_incidents_from_url
import os

app = Flask(__name__)
# Enable CORS for your GitHub Pages domain
CORS(app, origins=["https://aliattia02.github.io"])

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/extract', methods=['POST'])
def extract():
    data = request.json

    if 'text' in data:
        incidents = extract_incidents_from_text(data['text'])
        return jsonify({'incidents': incidents})
    elif 'url' in data:
        incidents = extract_incidents_from_url(data['url'])
        return jsonify({'incidents': incidents})
    else:
        return jsonify({'error': 'No text or URL provided'}), 400

if __name__ == '__main__':
    # Use PORT environment variable provided by Render
    port = int(os.environ.get('PORT', 5000))
    # Listen on all interfaces
    app.run(host='0.0.0.0', port=port)