import json
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
import sys
import os
import glob


def json_to_excel(json_file):
    """Convert any histXXX JSON to Excel workbook with multiple sheets"""

    # Auto-generate Excel filename
    excel_file = json_file.replace('.json', '.xlsx')

    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: File '{json_file}' not found")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ Error: Invalid JSON format in '{json_file}' - {e}")
        return False

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
            data.get('id', ''),
            data.get('event_type', ''),
            data.get('verification_status', ''),
            data.get('metadata', {}).get('pageTitle', ''),
            data.get('metadata', {}).get('description', ''),
            data.get('metadata', {}).get('keywords', ''),
            data.get('metadata', {}).get('lastUpdated', ''),
            data.get('metadata', {}).get('author', ''),
            data.get('date', {}).get('start', ''),
            data.get('date', {}).get('end', ''),
            data.get('date', {}).get('duration_days', ''),
            data.get('date', {}).get('display', ''),
            data.get('date', {}).get('context', ''),
            data.get('brief_summary', ''),
            data.get('hero', {}).get('category', ''),
            data.get('hero', {}).get('title', ''),
            data.get('hero', {}).get('subtitle', ''),
            data.get('casualties', {}).get('deaths', ''),
            data.get('casualties', {}).get('injured', ''),
            data.get('casualties', {}).get('forced_displacement', '')
        ]
    }
    pd.DataFrame(main_info).to_excel(writer, sheet_name='Main Info', index=False)

    # Sheet 2: Location
    location_data = []
    if 'location' in data and 'historical' in data['location']:
        for key, value in data['location']['historical'].items():
            location_data.append({
                'Category': 'historical',
                'Field': key,
                'Value': str(value) if not isinstance(value, (list, dict)) else json.dumps(value)
            })
    if 'location' in data and 'current' in data['location']:
        for key, value in data['location']['current'].items():
            location_data.append({
                'Category': 'current',
                'Field': key,
                'Value': str(value) if not isinstance(value, (list, dict)) else json.dumps(value)
            })
    pd.DataFrame(location_data).to_excel(writer, sheet_name='Location', index=False)

    # Sheet 3: Hero Meta Cards
    hero_cards = []
    if 'hero' in data and 'metaCards' in data['hero']:
        for card in data['hero']['metaCards']:
            hero_cards.append({
                'Icon': card.get('icon', ''),
                'Label': card.get('label', ''),
                'Value': card.get('value', ''),
                'Detail': card.get('detail', '')
            })
    pd.DataFrame(hero_cards).to_excel(writer, sheet_name='Hero Cards', index=False)

    # Sheet 4: Quick Facts
    quick_facts = []
    if 'quickFacts' in data and 'items' in data['quickFacts']:
        for item in data['quickFacts']['items']:
            quick_facts.append({
                'Label': item.get('label', ''),
                'Value': item.get('value', '')
            })
    pd.DataFrame(quick_facts).to_excel(writer, sheet_name='Quick Facts', index=False)

    # Sheet 5: Perpetrators
    perpetrators = pd.DataFrame({
        'Perpetrator': data.get('perpetrators', [])
    })
    perpetrators.to_excel(writer, sheet_name='Perpetrators', index=False)

    # Sheet 6: Personalities - Commanders
    if 'personalities' in data and 'commanders' in data['personalities']:
        commanders = []
        for person in data['personalities']['commanders']:
            commanders.append({
                'Name': person.get('name', ''),
                'Name Hebrew/Arabic': person.get('name_hebrew', person.get('name_arabic', '')),
                'Birth-Death': person.get('birth_death', ''),
                'Role': person.get('role', ''),
                'Responsibility': person.get('responsibility', ''),
                'Later Position 1': person.get('later_positions', [''])[0] if person.get('later_positions') else '',
                'Later Position 2': person.get('later_positions', ['', ''])[1] if len(
                    person.get('later_positions', [])) > 1 else '',
                'Later Position 3': person.get('later_positions', ['', '', ''])[2] if len(
                    person.get('later_positions', [])) > 2 else '',
                'Accountability': person.get('accountability', ''),
                'Notes': person.get('notes', '')
            })
        pd.DataFrame(commanders).to_excel(writer, sheet_name='Commanders', index=False)

    # Sheet 7: Witnesses & Critics (if exists in personalities)
    if 'personalities' in data and 'witnesses_critics' in data['personalities']:
        witnesses = []
        for person in data['personalities']['witnesses_critics']:
            witnesses.append({
                'Name': person.get('name', ''),
                'Name Hebrew/Arabic': person.get('name_hebrew', person.get('name_arabic', '')),
                'Birth-Death': person.get('birth_death', ''),
                'Role': person.get('role', ''),
                'Responsibility': person.get('responsibility', ''),
                'Notes': person.get('notes', '')
            })
        pd.DataFrame(witnesses).to_excel(writer, sheet_name='Witnesses & Critics', index=False)

    # Sheet 8: Organizational Context (if exists)
    if 'personalities' in data and 'organizational_context' in data['personalities']:
        org_context = []
        for key, value in data['personalities']['organizational_context'].items():
            org_context.append({
                'Organization': key,
                'Description': value
            })
        pd.DataFrame(org_context).to_excel(writer, sheet_name='Org Context', index=False)

    # Sheet 9: Timeline
    timeline = []
    if 'timeline' in data and 'events' in data['timeline']:
        for event in data['timeline']['events']:
            source_links = []
            if 'sourceLinks' in event:
                for link in event['sourceLinks']:
                    source_links.append(f"{link.get('name', '')}: {link.get('url', '')}")
            timeline.append({
                'Time': event.get('time', ''),
                'Title': event.get('title', ''),
                'Description': event.get('description', ''),
                'Source': event.get('source', ''),
                'Source Links': ' | '.join(source_links)
            })
    pd.DataFrame(timeline).to_excel(writer, sheet_name='Timeline', index=False)

    # Sheet 10: War Crimes (simple list if exists)
    if 'war_crimes' in data:
        war_crimes_list = pd.DataFrame({
            'War Crime': data.get('war_crimes', [])
        })
        war_crimes_list.to_excel(writer, sheet_name='War Crimes List', index=False)

    # Sheet 11: War Crimes (detailed)
    if 'warCrimes' in data and 'crimes' in data['warCrimes']:
        war_crimes = []
        for crime in data['warCrimes']['crimes']:
            war_crimes.append({
                'Icon': crime.get('icon', ''),
                'Title': crime.get('title', ''),
                'Description': crime.get('description', ''),
                'Source Link': crime.get('sourceLink', ''),
                'Source Text': crime.get('sourceText', '')
            })
        pd.DataFrame(war_crimes).to_excel(writer, sheet_name='War Crimes Detail', index=False)

    # Sheet 12: Testimonies
    testimonies = []
    if 'testimonies' in data and 'witnesses' in data['testimonies']:
        for witness in data['testimonies']['witnesses']:
            testimonies.append({
                'Initials': witness.get('initials', ''),
                'Name': witness.get('name', ''),
                'Role': witness.get('role', ''),
                'Testimony': witness.get('testimony', ''),
                'Source': witness.get('source', ''),
                'Source Link': witness.get('sourceLink', '')
            })
    pd.DataFrame(testimonies).to_excel(writer, sheet_name='Testimonies', index=False)

    # Sheet 13: Sources
    sources = []
    if 'sources' in data and 'list' in data['sources']:
        for source in data['sources']['list']:
            sources.append({
                'Icon': source.get('icon', ''),
                'Name': source.get('name', ''),
                'Type': source.get('type', ''),
                'Description': source.get('description', ''),
                'Link': source.get('link', ''),
                'Verified': source.get('verified', False)
            })
    pd.DataFrame(sources).to_excel(writer, sheet_name='Sources', index=False)

    # Sheet 14: Executive Summary
    if 'executiveSummary' in data and 'paragraphs' in data['executiveSummary']:
        exec_summary = {
            'Paragraph': [f'Para {i + 1}' for i in range(len(data['executiveSummary']['paragraphs']))],
            'Text': data['executiveSummary']['paragraphs']
        }
        pd.DataFrame(exec_summary).to_excel(writer, sheet_name='Executive Summary', index=False)

    # Sheet 15: International Law
    intl_law = []
    if 'international_law' in data and 'sections' in data['international_law']:
        for section in data['international_law']['sections']:
            for i, violation in enumerate(section.get('violations', [])):
                intl_law.append({
                    'Heading': section.get('heading', ''),
                    'Violation': violation,
                    'Order': i + 1
                })
    pd.DataFrame(intl_law).to_excel(writer, sheet_name='International Law', index=False)

    # Sheet 16: Casualties Breakdown
    casualties = []
    if 'casualties' in data and 'breakdown' in data['casualties']:
        for item in data['casualties']['breakdown']:
            # Handle sources if they exist
            sources_str = ''
            if 'sources' in item:
                sources_list = []
                for src in item['sources']:
                    sources_list.append(f"{src.get('name', '')}: {src.get('link', '')}")
                sources_str = ' | '.join(sources_list)

            casualties.append({
                'Type': item.get('type', ''),
                'Number': item.get('number', ''),
                'Label': item.get('label', ''),
                'Detail': item.get('detail', ''),
                'Sources': sources_str
            })
    pd.DataFrame(casualties).to_excel(writer, sheet_name='Casualties', index=False)

    # Sheet 17: Historical Impact
    impact = []
    if 'historicalImpact' in data and 'sections' in data['historicalImpact']:
        for section in data['historicalImpact']['sections']:
            for i, item in enumerate(section.get('items', [])):
                impact.append({
                    'Heading': section.get('heading', ''),
                    'Item': item,
                    'Order': i + 1
                })
    pd.DataFrame(impact).to_excel(writer, sheet_name='Historical Impact', index=False)

    # Sheet 18: Media Images
    media_images = []
    if 'media' in data and 'images' in data['media']:
        for img in data['media']['images'].get('local', []):
            media_images.append({'Type': 'local', 'Source': img})
        for img in data['media']['images'].get('remote', []):
            media_images.append({'Type': 'remote', 'Source': img})
    pd.DataFrame(media_images).to_excel(writer, sheet_name='Media Images', index=False)

    # Sheet 19: Media Documents
    media_docs = []
    if 'media' in data and 'documents' in data['media']:
        for doc in data['media']['documents'].get('local', []):
            media_docs.append({'Type': 'local', 'Source': doc})
        for doc in data['media']['documents'].get('remote', []):
            media_docs.append({'Type': 'remote', 'Source': doc})
    pd.DataFrame(media_docs).to_excel(writer, sheet_name='Media Docs', index=False)

    # Sheet 20: CTA Buttons
    if 'cta' in data and 'buttons' in data['cta']:
        cta_buttons = []
        for button in data['cta']['buttons']:
            cta_buttons.append({
                'Text': button.get('text', ''),
                'Link': button.get('link', ''),
                'Type': button.get('type', ''),
                'Action': button.get('action', '')
            })
        pd.DataFrame(cta_buttons).to_excel(writer, sheet_name='CTA Buttons', index=False)

    # Sheet 21: Breadcrumb (if exists)
    if 'breadcrumb' in data and 'items' in data['breadcrumb']:
        breadcrumb = []
        for item in data['breadcrumb']['items']:
            breadcrumb.append({
                'Text': item.get('text', ''),
                'Link': item.get('link', '')
            })
        pd.DataFrame(breadcrumb).to_excel(writer, sheet_name='Breadcrumb', index=False)

    writer.close()

    print(f"✅ Excel file created: {excel_file}")
    print(f"📊 Number of sheets: {len(pd.ExcelFile(excel_file).sheet_names)}")

    return True


def process_all_json_files():
    """Process all .json files except .translations.json"""

    # Get all .json files in current directory
    all_json_files = glob.glob('*.json')

    # Filter out .translations.json files
    json_files = [f for f in all_json_files if not f.endswith('.translations.json')]

    if not json_files:
        print("❌ No JSON files found (excluding .translations.json)")
        return

    print(f"📁 Found {len(json_files)} JSON file(s) to convert:\n")

    successful = 0
    failed = 0

    for json_file in sorted(json_files):
        print(f"🔄 Processing: {json_file}")
        if json_to_excel(json_file):
            successful += 1
        else:
            failed += 1
        print()

    print("=" * 60)
    print(f"✅ Successfully converted: {successful}")
    if failed > 0:
        print(f"❌ Failed: {failed}")
    print(f"📂 Location: {os.path.abspath('.')}")


# Usage
if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Single file mode
        json_file = sys.argv[1]
        print(f"📄 Using: {json_file}\n")
        json_to_excel(json_file)
    else:
        # Batch mode - process all JSON files except .translations.json
        print("🔄 Batch mode: Converting all .json files (excluding .translations.json)\n")
        process_all_json_files()