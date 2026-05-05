import pandas as pd


def parse_date(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", dayfirst=True)


def parse_numeric(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce")

    cleaned = (
        series.astype(str)
        .str.strip()
        .str.replace("R$", "", regex=False)
        .str.replace(".", "", regex=False)
        .str.replace(",", ".", regex=False)
        .str.replace(r"[^0-9\.-]", "", regex=True)
    )
    return pd.to_numeric(cleaned, errors="coerce")


def clean_text(series: pd.Series) -> pd.Series:
    return series.astype(str).str.strip().replace({"nan": None, "": None})