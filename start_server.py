#!/usr/bin/env python
import os
import sys

# Add backend to path
backend_path = os.path.join(os.path.dirname(__file__), 'backend')
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Change to backend directory
os.chdir(backend_path)

# Configure Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'safe_path_api.settings')

import django
django.setup()

from django.core.management import execute_from_command_line

if __name__ == "__main__":
    sys.argv = [sys.argv[0], 'runserver', '0.0.0.0:8000']
    execute_from_command_line(sys.argv)
