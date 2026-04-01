#!/usr/bin/env python3
"""Scrapes Bitcoin ETF flow data from farside.co.uk and saves to data/etf-flows.json."""

import json
import os
import sys
from datetime import date

import requests
from bs4 import BeautifulSoup

URL = "https://farside.co.uk/bitcoin-etf-flow-all-data/"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


def parse_val(cells, idx):
    if idx < 0 or idx >= len(cells):
        return None
    text = cells[idx].get_text(strip=True)
    if not text or text == "-":
        return None
    # Negative values may be written as (123.4)
    text = text.replace(",", "").replace("(", "-").replace(")", "")
    try:
        return float(text)
    except ValueError:
        return None


def main():
    print(f"Fetching {URL} ...")
    r = requests.get(URL, headers=HEADERS, timeout=20)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    table = soup.find("table")
    if not table:
        print("ERROR: No table found on page", file=sys.stderr)
        sys.exit(1)

    rows = table.find_all("tr")
    if not rows:
        print("ERROR: Table has no rows", file=sys.stderr)
        sys.exit(1)

    # Parse header row to locate column indices
    header_cells = rows[0].find_all(["th", "td"])
    col_names = [c.get_text(strip=True).upper() for c in header_cells]

    def find_col(name):
        for i, h in enumerate(col_names):
            if name.upper() in h:
                return i
        return -1

    date_col = 0
    ibit_col = find_col("IBIT")
    fbtc_col = find_col("FBTC")
    arkb_col = find_col("ARKB")
    total_col = find_col("TOTAL")

    print(f"Columns — IBIT:{ibit_col} FBTC:{fbtc_col} ARKB:{arkb_col} Total:{total_col}")

    flows = []
    for row in rows[1:]:
        cells = row.find_all(["td", "th"])
        if not cells:
            continue
        date_val = cells[date_col].get_text(strip=True) if cells else ""
        if not date_val:
            continue

        ibit = parse_val(cells, ibit_col)
        fbtc = parse_val(cells, fbtc_col)
        arkb = parse_val(cells, arkb_col)
        total = parse_val(cells, total_col)

        # Skip rows with no numeric data at all
        if all(v is None for v in [ibit, fbtc, arkb, total]):
            continue

        flows.append(
            {"date": date_val, "IBIT": ibit, "FBTC": fbtc, "ARKB": arkb, "total": total}
        )

    if not flows:
        print("ERROR: No data rows found", file=sys.stderr)
        sys.exit(1)

    # Keep only the last 10 trading days
    flows = flows[-10:]

    os.makedirs("data", exist_ok=True)
    result = {
        "updated": date.today().isoformat(),
        "source": "farside.co.uk",
        "flows": flows,
    }

    with open("data/etf-flows.json", "w") as f:
        json.dump(result, f, indent=2)

    print(f"OK: saved {len(flows)} rows, last date: {flows[-1]['date']}")


if __name__ == "__main__":
    main()
