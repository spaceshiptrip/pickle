import pandas as pd
import os

# Define path
file_path = 'spreadsheet/Caltech Picklers - October 2025.xlsx'

if not os.path.exists(file_path):
    print(f"File not found at: {file_path}")
    # try full path just in case
    file_path = '/Users/jtorres/Workspaces/pnb/pickle/checkin/checkin-app/spreadsheet/Caltech Picklers - October 2025.xlsx'

try:
    # Read all sheets
    xls = pd.ExcelFile(file_path)
    print(f"Sheet names: {xls.sheet_names}")

    for sheet_name in xls.sheet_names:
        print(f"\n--- Sheet: {sheet_name} ---")
        df = pd.read_excel(xls, sheet_name=sheet_name, nrows=5)
        print("Columns:")
        print(df.columns.tolist())
        print("First 5 rows:")
        print(df.head())
        
except Exception as e:
    print(f"Error reading file: {e}")
