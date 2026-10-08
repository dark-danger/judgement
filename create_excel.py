import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import os

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Agrash Registrations"

# Data list matching the user's Google Sheet screenshots exactly
data = [
    ["School Name", "Group Dance", "Tags", "Group Song", "Tags", "Declamation", "Tags", "Science Exhibition", "Tags", "Green Room Allocation"],
    ["58", "43", "", "27", "", "44", "", "30", "", ""],
    ["Delhi Public School DPS Kathua", "YES", "D-21", "", "", "YES", "DC-21", "YES", "SE-21", "F-501"],
    ["SMR International School Safidon", "YES", "D-22", "", "", "YES", "DC-22", "", "", "F-502"],
    ["ST Andrews World School Kundli", "", "", "YES", "S-23", "", "", "", "", "F-503"],
    ["Sant Nikka Singh Public School Model Town Karnal", "YES", "D-24", "YES", "S-24", "YES", "DC-24", "", "", "F-504"],
    ["JP Jain Sr Sec School Sonipat", "YES", "D-25", "", "", "YES", "DC-25", "", "", "F-505"],
    ["Himgiri Public School Samalkha", "YES", "D-26", "", "", "", "", "", "", "F-506"],
    ["Delhi Public School DPS Panipat City", "", "", "", "", "YES", "DC-27", "YES", "SE-27", "F-507"],
    ["Doon Public School Gohana", "YES", "D-28", "", "", "YES", "DC-28", "YES", "SE-28", "F-508"],
    ["Navyug Public High School", "", "", "", "", "", "", "YES", "SE-29", "F-509"],
    ["Arya Kanya Gurukul Sr Sec School Karnal", "YES", "D-30", "YES", "S-30", "YES", "DC-30", "", "", "F-510"],
    ["Pratap Public School Sector 6 Karnal", "", "", "", "", "YES", "DC-31", "YES", "SE-31", "F-511"],
    ["DAV Public School Thermal Colony Panipat", "YES", "D-32", "", "", "", "", "YES", "SE-32", "F-513"],
    ["DAV Police Public Sr Sec School Police Line Sonipat", "YES", "D-33", "", "", "", "", "YES", "SE-33", "F-514"],
    ["Guru Teg Bhadur Public School Karnal", "YES", "D-34", "YES", "S-34", "YES", "DC-34", "YES", "SE-34", "F-401"],
    ["Ujala Modern Sr Sec School Kaith Shahpur Israna", "YES", "D-35", "", "", "", "", "", "", "F-405"],
    ["Motilal Nehru Public School Urban Estate Jind", "YES", "D-36", "", "", "YES", "DC-36", "YES", "SE-36", "F-406"],
    ["DAV Police Public School Police Line Karnal", "YES", "D-37", "YES", "S-37", "YES", "DC-37", "YES", "SE-37", "F-407"],
    ["Sarv Vidya Public School Indri", "YES", "D-38", "", "", "YES", "DC-38", "", "", "F-408"],
    ["Halwasiya Vidya Vihar Sr Sec School Bhiwani", "YES", "D-39", "YES", "S-39", "YES", "DC-39", "YES", "SE-39", "F-409"],
    ["Shiv Shakti Sr Sec School Sonipat", "", "", "", "", "YES", "DC-40", "", "", "F-410"],
    ["Pratap Singh Memorial Sr Sec School Sonipat", "", "", "", "", "YES", "DC-41", "YES", "SE-41", "F-302"],
    ["Babu Ram ( BR ) Global School Gannaur", "", "", "YES", "S-42", "YES", "DC-42", "YES", "SE-42", "F-303"],
    ["MM Public School Assandh", "YES", "D-43", "YES", "S-43", "YES", "DC-43", "YES", "SE-43", "F-310"],
    ["Mothers Pride School Pataudi Gurugram", "YES", "D-44", "YES", "S-44", "YES", "DC-44", "YES", "SE-44", "F-311"],
    ["BR International Public School Kurukshetra", "YES", "D-45", "YES", "S-45", "YES", "DC-45", "YES", "SE-45", "F-202"],
    ["RPS International School Sector 50 Gurgaon", "", "", "", "", "", "", "YES", "SE-46", "F-203"],
    ["Holy Family Convent School Gohana", "", "", "", "", "YES", "DC-47", "", "", "F-204"],
    ["Mahavati Sports Sr Sec School Pawti Samalkha", "", "", "", "", "YES", "DC-48", "YES", "SE-48", "F-205"],
    ["Lakshay International School Naultha Panipat", "YES", "D-49", "", "", "YES", "DC-49", "YES", "SE-49", "F-206"],
    ["Rishikul Vidyapeeth Sonipat", "YES", "D-50", "YES", "S-50", "YES", "DC-50", "", "", "F-207"],
    ["Sant Nischal Singh Public School Yamunanagar", "YES", "D-51", "YES", "S-51", "YES", "DC-51", "YES", "SE-51", "F-209"],
    ["SD Sr Sec School Panipat", "YES", "D-52", "YES", "S-52", "YES", "DC-52", "YES", "SE-52", "F-210"],
    ["Geeta Vidya Mandir Public School Nimbari", "", "", "YES", "S-53", "", "", "YES", "SE-53", "D-201"],
    ["Dayanand Public School Gohana", "", "", "", "", "YES", "DC-54", "YES", "SE-54", "D-202"],
    ["Saraswati Public School Jagadhri Yamunanagar", "YES", "D-55", "YES", "S-55", "YES", "DC-55", "YES", "SE-55", "D-204"],
    ["DAV Centenary Public School Police Line Samalkha Panipat", "YES", "D-56", "YES", "S-56", "", "", "", "", "D-205"],
    ["JPS Academy Assandh", "YES", "D-57", "YES", "S-57", "YES", "DC-57", "YES", "SE-57", "D-207"],
    ["Delhi Public School Jind", "YES", "D-58", "YES", "S-58", "YES", "DC-58", "", "", "D-404"],
    ["Maharishi Dayanand Sr Sec School Ballah Karnal", "YES", "D-59", "", "", "", "", "", "", "D-405"],
    ["Yaduvanshi Niketan School Sector 33 Gurugram", "YES", "D-60", "", "", "YES", "DC-60", "YES", "SE-60", "E-303"],
    ["Sant Nikka Singh Public School Zarifa Farm Karnal", "YES", "D-61", "YES", "S-61", "YES", "DC-61", "", "", "E-304"],
    ["Geeta Vidya Mandir Public School NHBC Panipat", "YES", "D-62", "YES", "S-62", "YES", "DC-62", "", "", "E-305"],
    ["Shaheed Bhagat Singh Sr Sec School Karnal", "YES", "D-63", "", "", "YES", "DC-63", "", "", "E-307"],
    ["Swastik Bal Vikas Sr Sec School Panipat", "YES", "D-64", "YES", "S-64", "YES", "DC-64", "YES", "SE-64", "E-308"],
    ["Silver Bells Public School Shamli", "", "", "YES", "S-65", "YES", "DC-65", "", "", "E-310"],
    ["The Golden Era Public School", "YES", "D-66", "", "", "", "", "", "", ""],
    ["MASD Public School Panipat", "", "", "", "", "YES", "DC-67", "", "", ""],
    ["SD Modern Sr Sec School Panipat", "YES", "D-68", "", "", "YES", "DC-68", "", "", ""],
    ["DR MKK Arya Model Sr Sec School Panipat", "YES", "D-69", "YES", "S-69", "YES", "DC-69", "YES", "SE-69", ""],
    ["Global Public School Gohana", "", "", "", "", "YES", "DC-70", "", "", ""],
    ["Sunrise Public School Panipat", "YES", "D-71", "", "", "YES", "DC-71", "", "", ""],
    ["Gyandeep Sr Sec School Gannaur", "YES", "D-72", "", "", "YES", "DC-72", "YES", "SE-72", ""],
    ["OM Public School Gohana", "YES", "D-73", "YES", "S-73", "YES", "DC-73", "YES", "SE-73", ""],
    ["Montessori City School Kathua", "YES", "D-74", "", "", "", "", "", "", ""],
    ["Adarsh Vidya Mandir Sr Sec School Panipat", "YES", "D-75", "", "", "", "", "", "", ""],
    ["North Valley Public School", "YES", "D-76", "YES", "S-76", "YES", "DC-76", "", "", ""],
    ["RKSD Public School Kaithal", "YES", "D-77", "YES", "S-77", "", "", "", "", ""],
    ["DAV Police Public School Kurukshetra", "YES", "D-78", "YES", "S-78", "YES", "DC-78", "", "", ""]
]

# Write all data rows
for r_idx, row in enumerate(data, start=1):
    ws.append(row)

# Styling Definitions
font_header = Font(name="Arial", size=11, bold=True, color="000000")
font_count = Font(name="Arial", size=11, bold=True, color="FFFFFF")
font_school = Font(name="Arial", size=10, bold=True, color="000000")
font_cell = Font(name="Arial", size=10, color="000000")
font_tag = Font(name="Arial", size=10, bold=True, color="000000")

fill_gold = PatternFill(start_color="F5B041", end_color="F5B041", fill_type="solid") # Gold header
fill_maroon = PatternFill(start_color="4A1525", end_color="4A1525", fill_type="solid") # Maroon count row
fill_dance = PatternFill(start_color="D6EAF8", end_color="D6EAF8", fill_type="solid") # Light blue (Dance)
fill_song = PatternFill(start_color="D4EFDF", end_color="D4EFDF", fill_type="solid") # Light green (Song)
fill_declamation = PatternFill(start_color="E8F8F5", end_color="E8F8F5", fill_type="solid") # Mint (Declamation)
fill_science = PatternFill(start_color="E8F6F3", end_color="E8F6F3", fill_type="solid") # Science
fill_green_room = PatternFill(start_color="EAFAF1", end_color="EAFAF1", fill_type="solid")

thin_border = Border(
    left=Side(style='thin', color='BFBFBF'),
    right=Side(style='thin', color='BFBFBF'),
    top=Side(style='thin', color='BFBFBF'),
    bottom=Side(style='thin', color='BFBFBF')
)

align_center = Alignment(horizontal="center", vertical="center")
align_left = Alignment(horizontal="left", vertical="center")

# Apply Header Styles (Row 1)
for col_idx in range(1, 11):
    cell = ws.cell(row=1, column=col_idx)
    cell.font = font_header
    cell.fill = fill_gold if col_idx < 10 else fill_green_room
    cell.alignment = align_left if col_idx == 1 else align_center
    cell.border = thin_border

# Apply Count Row Styles (Row 2)
for col_idx in range(1, 11):
    cell = ws.cell(row=2, column=col_idx)
    cell.font = font_count
    cell.fill = fill_maroon
    cell.alignment = align_center
    cell.border = thin_border

# Apply Data Rows Styles (Row 3 to 60)
for row_idx in range(3, len(data) + 1):
    ws.row_dimensions[row_idx].height = 20
    for col_idx in range(1, 11):
        cell = ws.cell(row=row_idx, column=col_idx)
        cell.border = thin_border
        val = str(cell.value or "").strip()

        if col_idx == 1:
            cell.font = font_school
            cell.alignment = align_left
        else:
            cell.alignment = align_center
            if "D-" in val or "S-" in val or "DC-" in val or "SE-" in val:
                cell.font = font_tag
            else:
                cell.font = font_cell

        # Column background colors matching screenshot
        if col_idx in [2, 3]:
            cell.fill = fill_dance
        elif col_idx in [4, 5]:
            cell.fill = fill_song
        elif col_idx in [6, 7]:
            cell.fill = fill_declamation
        elif col_idx in [8, 9]:
            cell.fill = fill_science
        elif col_idx == 10:
            cell.fill = fill_green_room

# Auto-adjust column widths
for col in ws.columns:
    max_len = 0
    col_letter = get_column_letter(col[0].column)
    for cell in col:
        if cell.value:
            max_len = max(max_len, len(str(cell.value)))
    ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

ws.column_dimensions['A'].width = 52 # School name column width

# Save Excel files
root_file = "/Users/yash/Documents/WORKS/Registration/agrash_schools_sheet.xlsx"
static_file = "/Users/yash/Documents/WORKS/Registration/static/agrash_schools_sheet.xlsx"

wb.save(root_file)
wb.save(static_file)
print(f"🎉 Successfully created Excel file matching screenshots: {root_file}")
