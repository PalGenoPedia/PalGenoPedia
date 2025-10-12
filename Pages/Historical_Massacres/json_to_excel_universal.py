import json
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
import sys

def json_to_excel(json_file):
    """Convert any histXXX JSON to Excel workbook with multiple sheets"""
    
    # Auto-generate Excel filename
    excel_file = json_file.replace('.json', '.xlsx')
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Create Excel writer
    writer = pd.ExcelWriter(excel_file, engine='openpyxl')
    
    # Sheet 1: Main Info
    main_info = {
        'Field': [
            'id', 'event_type', 'verification_status',
            'pageTitle', 'description', 'keywords', 'lastUpdated', 'author',
            'date_start', 'date_end', 'date_duration_days', 'date_display', 'date_context',
            'brief_summary',
            'hero_category', 'hero_title', 'hero_subtitle',
            'deaths', 'injured', 'forced_displacement'
        ],
        'Value': [
            data['id'], 
            data['event_type'], 
            data['verification_status'],
            data['metadata']['pageTitle'], 
            data['metadata']['description'],
            data['metadata']['keywords'], 
            data['metadata']['lastUpdated'], 
            data['metadata']['author'],
            data['date']['start'], 
            data['date']['end'], 
            data['date']['duration_days'],
            data['date']['display'], 
            data['date']['context'],
            data['brief_summary'],
            data['hero']['category'], 
            data['hero']['title'], 
            data['hero']['subtitle'],
            data['casualties']['deaths'], 
            data['casualties']['injured'], 
            data['casualties']['forced_displacement']
        ]
    }
    pd.DataFrame(main_info).to_excel(writer, sheet_name='Main Info', index=False)
    
    # Sheet 2: Location
    location = {
        'Field': [],
        'Value': []
    }
    
    # Historical location
    for key, value in data['location']['historical'].items():
        location['Field'].append(f'historical_{key}')
        location['Value'].append(str(value) if not isinstance(value, (list, dict)) else json.dumps(value))
    
    # Current location
    for key, value in data['location']['current'].items():
        location['Field'].append(f'current_{key}')
        location['Value'].append(str(value) if not isinstance(value, (list, dict)) else json.dumps(value))
    
    pd.DataFrame(location).to_excel(writer, sheet_name='Location', index=False)
    
    # Sheet 3: Hero Meta Cards
    hero_cards = []
    for card in data['hero']['metaCards']:
        hero_cards.append({
            'Icon': card['icon'],
            'Label': card['label'],
            'Value': card['value'],
            'Detail': card.get('detail', '')
        })
    pd.DataFrame(hero_cards).to_excel(writer, sheet_name='Hero Cards', index=False)
    
    # Sheet 4: Quick Facts
    quick_facts = []
    for item in data['quickFacts']['items']:
        quick_facts.append({
            'Label': item['label'],
            'Value': item['value']
        })
    pd.DataFrame(quick_facts).to_excel(writer, sheet_name='Quick Facts', index=False)
    
    # Sheet 5: Perpetrators
    perpetrators = pd.DataFrame({
        'Perpetrator': data.get('perpetrators', [])
    })
    perpetrators.to_excel(writer, sheet_name='Perpetrators', index=False)
    
    # Sheet 6: Personalities - Commanders
    if 'personalities' in data and data['personalities']:
        commanders = []
        for person in data['personalities'].get('commanders', []):
            commanders.append({
                'Name': person['name'],
                'Name Hebrew/Arabic': person.get('name_hebrew', person.get('name_arabic', '')),
                'Birth-Death': person['birth_death'],
                'Role': person['role'],
                'Responsibility': person['responsibility'],
                'Later Position 1': person['later_positions'][0] if len(person['later_positions']) > 0 else '',
                'Later Position 2': person['later_positions'][1] if len(person['later_positions']) > 1 else '',
                'Later Position 3': person['later_positions'][2] if len(person['later_positions']) > 2 else '',
                'Accountability': person.get('accountability', ''),
                'Notes': person.get('notes', ''),
                'Type': 'commander'
            })
        
        # Witnesses
        for person in data['personalities'].get('witnesses_critics', []):
            commanders.append({
                'Name': person['name'],
                'Name Hebrew/Arabic': person.get('name_hebrew', person.get('name_arabic', '')),
                'Birth-Death': person['birth_death'],
                'Role': person['role'],
                'Responsibility': person['responsibility'],
                'Later Position 1': person['later_positions'][0] if len(person['later_positions']) > 0 else '',
                'Later Position 2': person['later_positions'][1] if len(person['later_positions']) > 1 else '',
                'Later Position 3': '',
                'Accountability': '',
                'Notes': person.get('notes', ''),
                'Type': 'witness'
            })
        
        pd.DataFrame(commanders).to_excel(writer, sheet_name='Personalities', index=False)
        
        # Organizational Context
        if 'organizational_context' in data['personalities']:
            org_context = []
            for key, value in data['personalities']['organizational_context'].items():
                org_context.append({
                    'Organization': key,
                    'Description': value
                })
            pd.DataFrame(org_context).to_excel(writer, sheet_name='Org Context', index=False)
    
    # Sheet 7: Timeline
    timeline = []
    for event in data['timeline']['events']:
        timeline.append({
            'Time': event['time'],
            'Title': event['title'],
            'Description': event['description'],
            'Source': event.get('source', '')
        })
    pd.DataFrame(timeline).to_excel(writer, sheet_name='Timeline', index=False)
    
    # Sheet 8: War Crimes (simple list)
    war_crimes_list = pd.DataFrame({
        'War Crime': data.get('war_crimes', [])
    })
    war_crimes_list.to_excel(writer, sheet_name='War Crimes List', index=False)
    
    # Sheet 9: War Crimes (detailed)
    if 'warCrimes' in data:
        war_crimes = []
        for crime in data['warCrimes']['crimes']:
            war_crimes.append({
                'Icon': crime['icon'],
                'Title': crime['title'],
                'Description': crime['description'],
                'Source Link': crime.get('sourceLink', ''),
                'Source Text': crime.get('sourceText', '')
            })
        pd.DataFrame(war_crimes).to_excel(writer, sheet_name='War Crimes Detail', index=False)
    
    # Sheet 10: Testimonies
    testimonies = []
    for witness in data['testimonies']['witnesses']:
        testimonies.append({
            'Initials': witness['initials'],
            'Name': witness['name'],
            'Role': witness['role'],
            'Testimony': witness['testimony'],
            'Source': witness['source'],
            'Source Link': witness.get('sourceLink', '')
        })
    pd.DataFrame(testimonies).to_excel(writer, sheet_name='Testimonies', index=False)
    
    # Sheet 11: Sources
    sources = []
    for source in data['sources']['list']:
        sources.append({
            'Icon': source.get('icon', ''),
            'Name': source['name'],
            'Type': source['type'],
            'Description': source['description'],
            'Link': source.get('link', ''),
            'Verified': source.get('verified', False)
        })
    pd.DataFrame(sources).to_excel(writer, sheet_name='Sources', index=False)
    
    # Sheet 12: Executive Summary
    exec_summary = {
        'Paragraph': [f'Para {i+1}' for i in range(len(data['executiveSummary']['paragraphs']))],
        'Text': data['executiveSummary']['paragraphs']
    }
    pd.DataFrame(exec_summary).to_excel(writer, sheet_name='Executive Summary', index=False)
    
    # Sheet 13: International Law
    intl_law = []
    for section in data['international_law']['sections']:
        for i, violation in enumerate(section['violations']):
            intl_law.append({
                'Heading': section['heading'],
                'Violation': violation,
                'Order': i + 1
            })
    pd.DataFrame(intl_law).to_excel(writer, sheet_name='International Law', index=False)
    
    # Sheet 14: Casualties Breakdown
    casualties = []
    for item in data['casualties']['breakdown']:
        casualties.append({
            'Type': item['type'],
            'Number': item['number'],
            'Label': item['label'],
            'Detail': item['detail']
        })
    pd.DataFrame(casualties).to_excel(writer, sheet_name='Casualties', index=False)
    
    # Sheet 15: Historical Impact
    impact = []
    for section in data['historicalImpact']['sections']:
        for i, item in enumerate(section['items']):
            impact.append({
                'Heading': section['heading'],
                'Item': item,
                'Order': i + 1
            })
    pd.DataFrame(impact).to_excel(writer, sheet_name='Historical Impact', index=False)
    
    # Sheet 16: Media
    media_images = []
    if 'media' in data:
        for img in data['media']['images'].get('local', []):
            media_images.append({'Type': 'local', 'Source': img})
        for img in data['media']['images'].get('remote', []):
            media_images.append({'Type': 'remote', 'Source': img})
    pd.DataFrame(media_images).to_excel(writer, sheet_name='Media Images', index=False)
    
    media_docs = []
    if 'media' in data:
        for doc in data['media']['documents'].get('local', []):
            media_docs.append({'Type': 'local', 'Source': doc})
        for doc in data['media']['documents'].get('remote', []):
            media_docs.append({'Type': 'remote', 'Source': doc})
    pd.DataFrame(media_docs).to_excel(writer, sheet_name='Media Docs', index=False)
    
    # Sheet 17: CTA Buttons
    if 'cta' in data:
        cta_buttons = []
        for button in data['cta']['buttons']:
            cta_buttons.append({
                'Text': button['text'],
                'Link': button['link'],
                'Type': button['type'],
                'Action': button.get('action', '')
            })
        pd.DataFrame(cta_buttons).to_excel(writer, sheet_name='CTA Buttons', index=False)
    
    # Sheet 18: Breadcrumb
    breadcrumb = []
    for item in data['breadcrumb']['items']:
        breadcrumb.append({
            'Text': item['text'],
            'Link': item.get('link', '')
        })
    pd.DataFrame(breadcrumb).to_excel(writer, sheet_name='Breadcrumb', index=False)
    
    writer.close()
    
    print(f"✅ Excel file created: {excel_file}")
    print(f"📊 Sheets created: {writer.sheets}")
    print(f"\n📁 Location: {excel_file}")

# Usage
if __name__ == "__main__":
    if len(sys.argv) > 1:
        json_file = sys.argv[1]
    else:
        # Default files
        import os
        if os.path.exists('lydda-death-march-1948.json'):
            json_file = 'lydda-death-march-1948.json.json'
        elif os.path.exists('lydda-death-march-1948.json'):
            json_file = 'lydda-death-march-1948.json'
        else:
            print("❌ No JSON file found. Usage: python json_to_excel_universal.py <filename.json>")
            sys.exit(1)
    
    json_to_excel(json_file)