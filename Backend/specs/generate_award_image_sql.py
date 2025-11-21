#!/usr/bin/env python3
"""
Generate SQL UPDATE statements for medal_definitions.image_filename
and trophy_definitions.image_filename from medal_definitions.xlsx.

Usage:
    python generate_award_image_sql.py path/to/medal_definitions.xlsx > award_image_updates.sql
"""

import sys
from pathlib import Path

import pandas as pd


def escape_sql_literal(s: str) -> str:
    """Escape single quotes for SQL string literals."""
    return s.replace("'", "''")


def generate_updates_for_table(df: pd.DataFrame, table_name: str) -> list[str]:
    """
    Generate UPDATE statements for either medal_definitions or trophy_definitions.

    Expects columns:
      - age_group_label
      - Metric_code
      - Tier
      - Image_filename
    """
    sql_lines: list[str] = []

    for _, row in df.iterrows():
        age = row.get("age_group_label")
        metric = row.get("Metric_code")
        tier = row.get("Tier")
        filename = row.get("Image_filename")

        # skip header/blank rows
        if pd.isna(age) or pd.isna(metric) or pd.isna(tier) or pd.isna(filename):
            continue

        age_str = str(age).strip()
        metric_str = str(metric).strip().lower()
        tier_str = str(tier).strip().lower()
        file_str = str(filename).strip()

        # Build SQL with some normalization on the DB side too (lower & trim)
        sql = f"""UPDATE public.{table_name}
SET image_filename = '{escape_sql_literal(file_str)}'
WHERE age_group_label = '{escape_sql_literal(age_str)}'
  AND lower(trim(metric_code)) = '{escape_sql_literal(metric_str)}'
  AND lower(trim(tier)) = '{escape_sql_literal(tier_str)}';
"""
        sql_lines.append(sql)

    return sql_lines


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python generate_award_image_sql.py path/to/medal_definitions.xlsx", file=sys.stderr)
        sys.exit(1)

    xlsx_path = Path(sys.argv[1])
    if not xlsx_path.exists():
        print(f"ERROR: File not found: {xlsx_path}", file=sys.stderr)
        sys.exit(1)

    # Read the two sheets
    medals_df = pd.read_excel(xlsx_path, sheet_name="Medals")
    trophies_df = pd.read_excel(xlsx_path, sheet_name="Trophies")

    medal_updates = generate_updates_for_table(medals_df, "medal_definitions")
    trophy_updates = generate_updates_for_table(trophies_df, "trophy_definitions")

    # Print everything to stdout so you can redirect into a .sql file
    print("-- SQL updates for medal_definitions.image_filename")
    for line in medal_updates:
        print(line, end="")

    print("\n-- SQL updates for trophy_definitions.image_filename")
    for line in trophy_updates:
        print(line, end="")


if __name__ == "__main__":
    main()
