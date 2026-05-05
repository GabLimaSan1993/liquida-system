import csv
import io
import pandas as pd


def _read_csv_with_fallbacks(file_bytes: bytes) -> pd.DataFrame:
    encodings = ["utf-8", "latin1", "cp1252"]

    for enc in encodings:
        try:
            text = file_bytes.decode(enc)
        except Exception:
            continue

        # tentativa 1: detectar delimitador automaticamente
        try:
            sample = text[:5000]
            dialect = csv.Sniffer().sniff(sample, delimiters=";,|\t")
            sep = dialect.delimiter

            df = pd.read_csv(
                io.StringIO(text),
                sep=sep,
                engine="python",
                on_bad_lines="skip",
                quotechar='"'
            )
            if df.shape[1] > 1:
                return df
        except Exception:
            pass

        # tentativa 2: delimitadores comuns
        for sep in [";", ",", "|", "\t"]:
            try:
                df = pd.read_csv(
                    io.StringIO(text),
                    sep=sep,
                    engine="python",
                    on_bad_lines="skip",
                    quotechar='"'
                )
                if df.shape[1] > 1:
                    return df
            except Exception:
                continue

    raise ValueError("Não foi possível interpretar o CSV com segurança.")


def read_uploaded_file(file) -> pd.DataFrame:
    name = file.name.lower()

    if name.endswith(".csv"):
        file.seek(0)
        file_bytes = file.read()
        return _read_csv_with_fallbacks(file_bytes)

    if name.endswith(".xlsx") or name.endswith(".xls"):
        file.seek(0)
        return pd.read_excel(file)

    raise ValueError("Formato não suportado. Envie CSV, XLSX ou XLS.")