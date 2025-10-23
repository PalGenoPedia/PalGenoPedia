#!/usr/bin/env python3
"""
Daily automation script for Gaza Crisis Documentation
Run this script daily to extract and update data
"""

import schedule
import time
import subprocess
import logging
from datetime import datetime
import os
import shutil

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('daily_automation.log'),
        logging.StreamHandler()
    ]
)

def backup_existing_files():
    """Backup existing CSV files"""
    backup_dir = f"backups/{datetime.now().strftime('%Y-%m-%d')}"
    os.makedirs(backup_dir, exist_ok=True)
    
    csv_files = [
        'total-population-statistics.csv',
        'total-population-cases.csv',
        'individual-cases-verified.csv',
        'references.csv',
        'un-quotes.csv',
        'resources.csv'
    ]
    
    for file in csv_files:
        if os.path.exists(file):
            shutil.copy2(file, backup_dir)
            logging.info(f"Backed up {file}")

def run_daily_extraction():
    """Run the daily data extraction"""
    try:
        logging.info("Starting daily data extraction...")
        
        # Backup existing files
        backup_existing_files()
        
        # Run the main extraction script
        result = subprocess.run(['python', 'daily_extractor.py'], 
                              capture_output=True, text=True)
        
        if result.returncode == 0:
            logging.info("Daily extraction completed successfully")
            logging.info(f"Output: {result.stdout}")
        else:
            logging.error(f"Daily extraction failed: {result.stderr}")
        
        # Generate summary report
        generate_daily_report()
        
    except Exception as e:
        logging.error(f"Error in daily extraction: {e}")

def generate_daily_report():
    """Generate daily summary report"""
    try:
        import pandas as pd
        
        report = {
            'date': datetime.now().strftime('%Y-%m-%d'),
            'files_status': {},
            'total_records': {}
        }
        
        csv_files = {
            'statistics': 'total-population-statistics.csv',
            'cases': 'total-population-cases.csv',
            'individual_cases': 'individual-cases-verified.csv',
            'references': 'references.csv',
            'quotes': 'un-quotes.csv'
        }
        
        for name, file in csv_files.items():
            try:
                if os.path.exists(file):
                    df = pd.read_csv(file)
                    report['files_status'][name] = 'exists'
                    report['total_records'][name] = len(df)
                else:
                    report['files_status'][name] = 'missing'
                    report['total_records'][name] = 0
            except Exception as e:
                report['files_status'][name] = f'error: {e}'
                report['total_records'][name] = 0
        
        # Save report
        import json
        with open(f"daily_report_{datetime.now().strftime('%Y-%m-%d')}.json", 'w') as f:
            json.dump(report, f, indent=2)
        
        logging.info(f"Daily report generated: {report}")
        
    except Exception as e:
        logging.error(f"Error generating daily report: {e}")

def schedule_daily_tasks():
    """Schedule daily tasks"""
    # Schedule daily extraction at 8:00 AM UTC
    schedule.every().day.at("08:00").do(run_daily_extraction)
    
    # Schedule backup at 23:00 UTC
    schedule.every().day.at("23:00").do(backup_existing_files)
    
    logging.info("Daily tasks scheduled")
    
    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute

if __name__ == "__main__":
    # Run immediately for testing
    # run_daily_extraction()
    
    # Or schedule for daily automation
    schedule_daily_tasks()