import numpy as np
import pandas as pd

from src.utils.formatters import parse_date, parse_numeric, clean_text


ENCERRADO_KEYWORDS = [
    "ENCERRADO",
    "ENCERRADA",
    "FINALIZADO",
    "FINALIZADA",
    "CONCLUIDO",
    "CONCLUÍDO",
    "CONCLUIDA",
    "CONCLUÍDA",
    "FECHADO",
    "FECHADA",
    "DISPONIVEL",
    "DISPONÍVEL",
]


COLUMN_ALIASES = {
    "num_OS": "num_os",
    "num_NF": "num_nf",
    "operacao": "operacao",
    "Marca": "marca",
    "Tag": "tag",
    "SerialIn": "serial_in",
    "SerialOut": "serial_out",
    "IMEI": "imei",
    "categoria_produto": "categoria_produto",
    "tipo_prod": "tipo_prod",
    "ETAPA": "etapa",
    "Modelo": "modelo",
    "descricaoProduto": "descricao_produto",
    "PartNumberModelo": "part_number_modelo",
    "Cor": "cor",
    "Banda": "banda",
    "numTecnico": "num_tecnico",
    "NomeTecnico": "nome_tecnico",
    "Dt_Abert": "dt_abert",
    "Aging_Day": "aging_day",
    "gradeQa_ANTIGO": "gradeqa_antigo",
    "subgradeQA_ANTIGO": "subgradeqa_antigo",
    "gradeLimpeza_ANTIGO": "gradelimpeza_antigo",
    "subGradeLimpeza_ANTIGO": "subgradelimpeza_antigo",
    "gradeEmbalagem_ANTIGO": "gradeembalagem_antigo",
    "subGradeEmbalagem_ANTIGO": "subgradeembalagem_antigo",
    "GradeFuncional": "grade_funcional",
    "GradeCosmetica": "grade_cosmetica",
    "GradeAcessorio": "grade_acessorio",
    "idLote": "id_lote",
    "dtLote": "dt_lote",
    "Pallet": "pallet",
    "SKU": "sku",
    "OBSERVACOES": "observacoes",
    "dtUltLog": "dt_ult_log",
    "descUltLog": "desc_ult_log",
    "local": "local",
    "motivo": "motivo",
    "descAtendimento": "desc_atendimento",
    "descProc": "desc_proc",
    "nome_cliente": "nome_cliente",
    "osAnterior": "os_anterior",
    "dtEncOsAnterior": "dt_enc_os_anterior",
    "servicoOsAnterior": "servico_os_anterior",
    "telaTrincada": "tela_trincada",
    "Custo_Net": "custo_net",
    "serialNumber": "serial_number",
    "UsuarioUltLog": "usuario_ult_log",
    "descLaudo": "desc_laudo",
    "problema": "problema",
    "subproblema": "subproblema",
    "informacaoScrap": "informacao_scrap",
    "ST": "st",
    "IPI": "ipi",
    "UnitImposto": "unit_imposto",
    "clienteOrigem": "cliente_origem",
}


TEXT_IDENTIFIER_COLUMNS = [
    "num_os",
    "num_nf",
    "tag",
    "serial_in",
    "serial_out",
    "imei",
    "part_number_modelo",
    "num_tecnico",
    "id_lote",
    "pallet",
    "sku",
    "os_anterior",
    "servico_os_anterior",
    "serial_number",
    "usuario_ult_log",
    "chave_item",
]


TEXT_COLUMNS = [
    "operacao",
    "marca",
    "categoria_produto",
    "tipo_prod",
    "etapa",
    "modelo",
    "descricao_produto",
    "cor",
    "banda",
    "nome_tecnico",
    "gradeqa_antigo",
    "subgradeqa_antigo",
    "gradelimpeza_antigo",
    "subgradelimpeza_antigo",
    "gradeembalagem_antigo",
    "subgradeembalagem_antigo",
    "grade_funcional",
    "grade_cosmetica",
    "grade_acessorio",
    "observacoes",
    "desc_ult_log",
    "local",
    "motivo",
    "desc_atendimento",
    "desc_proc",
    "nome_cliente",
    "tela_trincada",
    "desc_laudo",
    "problema",
    "subproblema",
    "informacao_scrap",
    "cliente_origem",
]


DATE_COLUMNS = [
    "dt_abert",
    "dt_lote",
    "dt_ult_log",
    "dt_enc_os_anterior",
]


NUMERIC_COLUMNS = [
    "custo_net",
    "st",
    "ipi",
    "unit_imposto",
]


def standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(col).strip() for col in df.columns]
    df.rename(columns=COLUMN_ALIASES, inplace=True)
    return df


def normalize_identifier(value):
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    text = str(value).strip()

    if text == "" or text.lower() == "nan":
        return None

    return text


def build_chave_item(df: pd.DataFrame) -> pd.Series:
    if "imei" in df.columns:
        imei_series = df["imei"].apply(normalize_identifier)
    else:
        imei_series = pd.Series([None] * len(df), index=df.index)

    if "serial_out" in df.columns:
        serial_out_series = df["serial_out"].apply(normalize_identifier)
    else:
        serial_out_series = pd.Series([None] * len(df), index=df.index)

    return imei_series.fillna(serial_out_series)


def is_encerrado(row: pd.Series) -> bool:
    joined = " | ".join(
        [
            str(row.get("etapa", "") or ""),
            str(row.get("desc_ult_log", "") or ""),
            str(row.get("desc_proc", "") or ""),
        ]
    ).upper()

    return any(keyword in joined for keyword in ENCERRADO_KEYWORDS)


def force_text_identifiers(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    for col in TEXT_IDENTIFIER_COLUMNS:
        if col in df.columns:
            df[col] = df[col].apply(normalize_identifier)

    return df


def clean_aging_day(series: pd.Series) -> pd.Series:
    numeric = parse_numeric(series)
    numeric = pd.to_numeric(numeric, errors="coerce")

    numeric = numeric.where((numeric >= 0) & (numeric <= 5000), np.nan)

    return numeric


def prepare_aging(df: pd.DataFrame) -> pd.DataFrame:
    df = standardize_columns(df)
    df = df.copy()

    df = force_text_identifiers(df)

    for col in TEXT_COLUMNS:
        if col in df.columns:
            df[col] = clean_text(df[col])

    for col in DATE_COLUMNS:
        if col in df.columns:
            df[col] = parse_date(df[col])

    for col in NUMERIC_COLUMNS:
        if col in df.columns:
            df[col] = parse_numeric(df[col])

    if "aging_day" in df.columns:
        df["aging_day"] = clean_aging_day(df["aging_day"])

    df["chave_item"] = build_chave_item(df)

    if "chave_item" in df.columns:
        df["chave_item"] = df["chave_item"].apply(normalize_identifier)

    if "dt_abert" in df.columns and "dt_ult_log" in df.columns:
        aging_recalculado = (df["dt_ult_log"] - df["dt_abert"]).dt.days

        if "aging_day" not in df.columns:
            df["aging_day"] = aging_recalculado
        else:
            df["aging_day"] = df["aging_day"].fillna(aging_recalculado)

    if "aging_day" in df.columns:
        df["aging_day"] = pd.to_numeric(df["aging_day"], errors="coerce")

        df["aging_day"] = df["aging_day"].where(
            (df["aging_day"] >= 0) & (df["aging_day"] <= 5000),
            np.nan
        )

        df["aging_day"] = df["aging_day"].apply(
            lambda x: int(x) if pd.notna(x) else None
        )

    df["item_disponivel_venda"] = df.apply(is_encerrado, axis=1)

    df["status_os"] = np.where(
        df["item_disponivel_venda"],
        "Encerrado/Disponível para venda",
        "Em processo / não disponível",
    )

    return df