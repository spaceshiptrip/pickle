import pandas as pd
import os

# Define output path
output_path = 'spreadsheet/template.xlsx'

# Create DataFrames for the main data tabs
# Attendance: Date | Hours | Player Name | Present (1/0) | Charge (auto) | PAID | ReservationId
df_attendance = pd.DataFrame(columns=[
    'Date', 'Hours', 'Player Name', 'Present (1/0)', 'Charge (auto)', 'PAID', 'ReservationId'
])

# Reservations: Id | Date | Start | End | Court | Capacity | BaseFee
df_reservations = pd.DataFrame(columns=[
    'Id', 'Date', 'Start', 'End', 'Court', 'Capacity', 'BaseFee'
])

# Fees: ReservationId | FeeName | Amount
df_fees = pd.DataFrame(columns=[
    'ReservationId', 'FeeName', 'Amount'
])

# Summary Sheets (Placeholder data to demonstrate structure, user can extend formulas)
df_player_summary = pd.DataFrame({
    'Player': ['ExamplePlayer'], 
    'Sessions Attended': [0],
    'Total Charges': [0]
})

df_monthly_summary = pd.DataFrame({
    'Metric': ['Total Revenue'],
    'Value': [0]
})

# Write to Excel using XlsxWriter engine for formula support if needed, 
# or openpyxl which is already installed.
# We'll use openpyxl directly to easier write formulas if necessary, 
# but pandas with openpyxl engine is easier for structure.

try:
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        df_reservations.to_excel(writer, sheet_name='Reservations', index=False)
        df_attendance.to_excel(writer, sheet_name='Attendance', index=False)
        df_fees.to_excel(writer, sheet_name='Fees', index=False)
        
        # We write empty dataframes for summaries but we will inject formulas in the next step
        # actually let's just write the headers and I'll explain the formulas to the user
        # or I can try to write the formula string.
        
        # Let's try to add a formula.
        # Summary by Player
        # A: Player, B: Sessions, C: Charges
        # B2: =COUNTIFS(Attendance!C:C, A2, Attendance!D:D, 1)
        # C2: =SUMIFS(Attendance!E:E, Attendance!C:C, A2, Attendance!F:F, TRUE)
        
        # We need to access the workbook to add formulas.
        workbook = writer.book
        
        # --- Summary by Player ---
        ws_players = workbook.create_sheet('Summary by Player')
        ws_players['A1'] = 'Player'
        ws_players['B1'] = 'Sessions Attended'
        ws_players['C1'] = 'Total Paid'
        ws_players['A2'] = 'ExamplePlayer'
        # Formulas
        ws_players['B2'] = '=COUNTIFS(Attendance!C:C, A2, Attendance!D:D, 1)'
        ws_players['C2'] = '=SUMIFS(Attendance!E:E, Attendance!C:C, A2, Attendance!F:F, TRUE)'

        # --- Monthly Summary ---
        ws_monthly = workbook.create_sheet('Monthly Summary')
        ws_monthly['A1'] = 'Metric'
        ws_monthly['B1'] = 'Value'
        ws_monthly['A2'] = 'Total Revenue (Paid)'
        ws_monthly['B2'] = '=SUMIF(Attendance!F:F, TRUE, Attendance!E:E)'
        ws_monthly['A3'] = 'Total Unpaid'
        ws_monthly['B3'] = '=SUMIF(Attendance!F:F, FALSE, Attendance!E:E)'

    print(f"Successfully created {output_path}")

except Exception as e:
    print(f"Error creating template: {e}")
