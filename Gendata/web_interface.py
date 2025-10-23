from flask import Flask, render_template, request, jsonify, send_file
import json
import os
from datetime import datetime
import threading
from daily_extractor import GazaCrisisExtractor
import csv

app = Flask(__name__)

# Global variable to store extraction status
extraction_status = {
    'running': False,
    'progress': 0,
    'message': 'Ready',
    'last_extraction': None,
    'total_urls': 0,
    'processed_urls': 0
}


@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')


@app.route('/api/extract', methods=['POST'])
def extract_data():
    """Extract data from provided URLs"""
    global extraction_status

    if extraction_status['running']:
        return jsonify({'error': 'Extraction already in progress'}), 400

    data = request.get_json()
    urls = data.get('urls', [])

    if not urls:
        return jsonify({'error': 'No URLs provided'}), 400

    # Validate URLs
    valid_urls = []
    for url in urls:
        if isinstance(url, str) and url.strip():
            valid_urls.append(url.strip())

    if not valid_urls:
        return jsonify({'error': 'No valid URLs provided'}), 400

    # Start extraction in background thread
    thread = threading.Thread(target=run_extraction, args=(valid_urls,))
    thread.daemon = True
    thread.start()

    return jsonify({
        'message': 'Extraction started',
        'total_urls': len(valid_urls)
    })


def run_extraction(urls):
    """Run extraction in background thread"""
    global extraction_status

    try:
        extraction_status.update({
            'running': True,
            'progress': 0,
            'message': 'Starting extraction...',
            'total_urls': len(urls),
            'processed_urls': 0
        })

        # Initialize extractor
        extractor = GazaCrisisExtractor()
        extracted_data = []

        for i, url in enumerate(urls):
            extraction_status.update({
                'progress': int((i / len(urls)) * 100),
                'message': f'Processing URL {i + 1}/{len(urls)}: {url[:50]}...',
                'processed_urls': i
            })

            data = extractor.extract_article_data(url)
            if data:
                extracted_data.append(data)

        # Save extracted data
        if extracted_data:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"data_files/daily_reports/web_extraction_{timestamp}.csv"

            if extractor.save_to_csv(extracted_data, filename):
                # Update main CSV
                extractor.update_main_csv(extracted_data)

                extraction_status.update({
                    'running': False,
                    'progress': 100,
                    'message': f'Extraction completed! {len(extracted_data)} articles processed.',
                    'last_extraction': datetime.now().isoformat(),
                    'processed_urls': len(urls),
                    'output_file': filename
                })
            else:
                extraction_status.update({
                    'running': False,
                    'progress': 100,
                    'message': 'Extraction completed but failed to save data.',
                    'processed_urls': len(urls)
                })
        else:
            extraction_status.update({
                'running': False,
                'progress': 100,
                'message': 'Extraction completed but no data was extracted.',
                'processed_urls': len(urls)
            })

    except Exception as e:
        extraction_status.update({
            'running': False,
            'progress': 0,
            'message': f'Extraction failed: {str(e)}',
            'processed_urls': 0
        })


@app.route('/api/status')
def get_status():
    """Get current extraction status"""
    return jsonify(extraction_status)


@app.route('/api/files')
def list_files():
    """List extracted CSV files"""
    try:
        files = []
        reports_dir = 'data_files/daily_reports'

        if os.path.exists(reports_dir):
            for filename in os.listdir(reports_dir):
                if filename.endswith('.csv'):
                    filepath = os.path.join(reports_dir, filename)
                    stat = os.stat(filepath)
                    files.append({
                        'filename': filename,
                        'size': stat.st_size,
                        'created': datetime.fromtimestamp(stat.st_ctime).isoformat(),
                        'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })

        # Sort by creation time (newest first)
        files.sort(key=lambda x: x['created'], reverse=True)

        return jsonify({'files': files})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/download/<filename>')
def download_file(filename):
    """Download a specific CSV file"""
    try:
        filepath = os.path.join('data_files/daily_reports', filename)

        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404

        return send_file(filepath, as_attachment=True)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/preview/<filename>')
def preview_file(filename):
    """Preview CSV file content without pandas"""
    try:
        filepath = os.path.join('data_files/daily_reports', filename)

        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404

        # Read CSV manually without pandas
        rows = []
        columns = []
        total_rows = 0

        with open(filepath, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            columns = reader.fieldnames or []

            for i, row in enumerate(reader):
                if i < 10:  # Only read first 10 rows for preview
                    rows.append(row)
                total_rows += 1

        preview_data = {
            'columns': columns,
            'rows': rows,
            'total_rows': total_rows
        }

        return jsonify(preview_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/statistics')
def get_statistics():
    """Get extraction statistics without pandas"""
    try:
        stats = {
            'total_files': 0,
            'total_incidents': 0,
            'recent_extractions': 0,
            'file_sizes': []
        }

        reports_dir = 'data_files/daily_reports'

        if os.path.exists(reports_dir):
            files = [f for f in os.listdir(reports_dir) if f.endswith('.csv')]
            stats['total_files'] = len(files)

            # Count recent extractions (last 7 days)
            recent_count = 0
            total_incidents = 0

            for filename in files:
                filepath = os.path.join(reports_dir, filename)
                stat = os.stat(filepath)

                # Check if file is from last 7 days
                file_age = datetime.now().timestamp() - stat.st_ctime
                if file_age < 7 * 24 * 3600:  # 7 days in seconds
                    recent_count += 1

                # Count incidents in file
                try:
                    with open(filepath, 'r', encoding='utf-8') as csvfile:
                        reader = csv.reader(csvfile)
                        next(reader, None)  # Skip header
                        total_incidents += sum(1 for row in reader)
                except:
                    pass

                stats['file_sizes'].append(stat.st_size)

            stats['recent_extractions'] = recent_count
            stats['total_incidents'] = total_incidents

        return jsonify(stats)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/validate-url', methods=['POST'])
def validate_url():
    """Validate if URL is accessible"""
    try:
        data = request.get_json()
        url = data.get('url', '').strip()

        if not url:
            return jsonify({'valid': False, 'error': 'No URL provided'})

        import requests
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        response = requests.head(url, headers=headers, timeout=10, allow_redirects=True)

        if response.status_code == 200:
            return jsonify({
                'valid': True,
                'status_code': response.status_code,
                'content_type': response.headers.get('content-type', '')
            })
        else:
            return jsonify({
                'valid': False,
                'error': f'HTTP {response.status_code}',
                'status_code': response.status_code
            })

    except Exception as e:
        return jsonify({
            'valid': False,
            'error': str(e)
        })


if __name__ == '__main__':
    # Ensure directories exist
    os.makedirs('data_files/daily_reports', exist_ok=True)
    os.makedirs('data_files/backups', exist_ok=True)
    os.makedirs('data_files/extraction_logs', exist_ok=True)

    print("Gaza Crisis Data Extractor Web Interface")
    print("Open your browser and go to: http://localhost:5000")
    print("Press Ctrl+C to stop the server")

    app.run(debug=True, host='0.0.0.0', port=5000)