#!/usr/bin/env python3
"""
Generate files and directories from a treemap structure.
Usage: python generate_from_treemap.py <treemap_file>
"""

import os
import sys
import re


def parse_treemap(content):
    """
    Parse treemap content and extract directory structure.
    Returns a list of full paths.
    """
    lines = content.strip().split('\n')
    structure = []
    current_dir = None

    for line in lines:
        # Skip empty lines
        if not line.strip():
            continue

        # Remove all tree drawing characters and get the actual name
        cleaned = re.sub(r'^[\s│┃┆├└┌┐┤┴┬┼─━┄┈╌╍╎╏╭╮╯╰╱╲╳▕▏▎▍▌▋▊▉█▓▒░■□▪▫]+', '', line)
        name = cleaned.strip()

        if not name:
            continue

        # Check if this line starts at column 0 (no indentation after cleaning tree chars)
        # A line with no leading spaces in original = top level
        has_indent = line.startswith(' ') or line.startswith('├') or line.startswith('└') or line.startswith('│')

        # Determine if it's a directory (ends with /)
        is_dir = name.endswith('/')
        if is_dir:
            name = name.rstrip('/')

        # If it's a directory at top level, set it as current directory
        if is_dir and not has_indent:
            current_dir = name
            structure.append((name, True))
        # If it has indentation and we have a current directory, it belongs inside
        elif has_indent and current_dir:
            full_path = os.path.join(current_dir, name)
            structure.append((full_path, is_dir))
        # Otherwise it's a top-level file
        else:
            structure.append((name, is_dir))

    return structure


def create_structure(structure, base_path='.'):
    """
    Create directories and files based on parsed structure.
    """
    created_dirs = []
    created_files = []

    for path, is_dir in structure:
        full_path = os.path.join(base_path, path)

        if is_dir:
            os.makedirs(full_path, exist_ok=True)
            created_dirs.append(full_path)
            print(f"📁 Created directory: {full_path}")
        else:
            # Create parent directory if needed
            parent = os.path.dirname(full_path)
            if parent:
                os.makedirs(parent, exist_ok=True)

            # Create empty file
            with open(full_path, 'w') as f:
                pass
            created_files.append(full_path)
            print(f"📄 Created file: {full_path}")

    return created_dirs, created_files


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_from_treemap.py <treemap_file>")
        print("\nOr pipe treemap content:")
        print("cat treemap.txt | python generate_from_treemap.py -")
        print("\nOr paste treemap and press Ctrl+D (Unix) or Ctrl+Z (Windows):")
        print("python generate_from_treemap.py -")
        sys.exit(1)

    # Read from file or stdin
    if sys.argv[1] == '-' or not sys.stdin.isatty():
        content = sys.stdin.read()
    else:
        try:
            with open(sys.argv[1], 'r', encoding='utf-8') as f:
                content = f.read()
        except FileNotFoundError:
            print(f"Error: File '{sys.argv[1]}' not found")
            sys.exit(1)

    # Parse and create structure
    print("Parsing treemap...\n")
    structure = parse_treemap(content)

    if not structure:
        print("No valid structure found in treemap")
        sys.exit(1)

    print(f"Found {len(structure)} items\n")

    # Create files and directories
    created_dirs, created_files = create_structure(structure)

    print(f"\n✅ Done!")
    print(f"   Created {len(created_dirs)} directories")
    print(f"   Created {len(created_files)} files")


if __name__ == '__main__':
    main()