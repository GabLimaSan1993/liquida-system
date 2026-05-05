import math
import json
import datetime as dt
import pandas as pd
import numpy as np
import streamlit as st

from src.supabase_client import get_supabase
from src.utils.file_reader import read_uploaded_file
from src.services.aging_service import prepare_aging


AGING_ALLOWED_COLUMNS = [
    "num_os",
    "num_nf",
    "operacao",
    "marca",
    "tag",
    "serial_in",
    "serial_out",
    "imei",
    "chave_item",
    "categoria_produto",
    "tipo_prod",
    "etapa",
    "modelo",
    "descricao_produto",
    "part_number_modelo",
    "cor",
    "banda",
    "num_tecnico",
    "nome_tecnico",
    "dt_abert",
    "aging_day",
    "gradeqa_antigo",
    "subgradeqa_antigo",
    "gradelimpeza_antigo",
    "subgradelimpeza_antigo",
    "gradeembalagem_antigo",
    "subgradeembalagem_antigo",
    "grade_funcional",
    "grade_cosmetica",
    "grade_acessorio",
    "id_lote",
    "dt_lote",
    "pallet",
    "sku",
    "observacoes",
    "dt_ult_log",
    "desc_ult_log",
    "local",
    "motivo",
    "desc_atendimento",
    "desc_proc",
    "nome_cliente",
    "os_anterior",
    "dt_enc_os_anterior",
    "servico_os_anterior",
    "tela_trincada",
    "custo_net",
    "serial_number",
    "usuario_ult_log",
    "desc_laudo",
    "problema",
    "subproblema",
    "informacao_scrap",
    "st",
    "ipi",
    "unit_imposto",
    "cliente_origem",
    "item_disponivel_venda",
    "status_os",
]

INTEGER_COLUMNS = {"aging_day"}


def test_supabase_connection():
    try:
        supabase = get_supabase()
        supabase.table("aging_raw").select("id").limit(1).execute()
        st.success("Conexão com Supabase realizada com sucesso.")
        return True
    except Exception as e:
        st.error(f"Erro ao conectar no Supabase: {e}")
        return False


def normalize_generic_value(value):
    if value is None or value is pd.NA:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    if isinstance(value, (pd.Timestamp, dt.datetime, dt.date)):
        return pd.to_datetime(value).isoformat()

    if isinstance(value, np.datetime64):
        converted = pd.to_datetime(value, errors="coerce")
        if pd.isna(converted):
            return None
        return converted.isoformat()

    if isinstance(value, (np.integer, int)):
        return int(value)

    if isinstance(value, (np.floating, float)):
        try:
            val = float(value)
            if math.isnan(val) or math.isinf(val):
                return None
            return float(val)
        except Exception:
            return None

    if isinstance(value, (np.bool_, bool)):
        return bool(value)

    return value


def normalize_integer_field(value):
    if value is None or value is pd.NA:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    try:
        return int(float(value))
    except Exception:
        return None


def clean_aging_dataframe_for_upload(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    unnamed_cols = [col for col in df.columns if str(col).strip().lower().startswith("unnamed:")]
    if unnamed_cols:
        df = df.drop(columns=unnamed_cols, errors="ignore")

    existing_allowed = [col for col in AGING_ALLOWED_COLUMNS if col in df.columns]
    return df[existing_allowed].copy()


def dataframe_to_json_records(df: pd.DataFrame):
    df_copy = df.copy()
    raw_records = df_copy.to_dict(orient="records")

    clean_records = []
    for row in raw_records:
        clean_row = {}
        for key, value in row.items():
            if key in INTEGER_COLUMNS:
                clean_row[key] = normalize_integer_field(value)
            else:
                clean_row[key] = normalize_generic_value(value)
        clean_records.append(clean_row)

    json.dumps(clean_records, allow_nan=False)
    return clean_records


def insert_in_batches(table_name: str, records: list, batch_size: int = 1000):
    supabase = get_supabase()
    total = len(records)

    progress_bar = st.progress(0)
    status_text = st.empty()

    inserted = 0

    for start in range(0, total, batch_size):
        end = min(start + batch_size, total)
        batch = records[start:end]

        try:
            supabase.table(table_name).insert(batch).execute()
        except Exception as e:
            st.error(f"Erro no lote de registros {start + 1} até {end}: {e}")
            with st.expander("Diagnóstico do lote com erro"):
                st.write("Primeiros 3 registros do lote:")
                st.json(batch[:3])
            raise

        inserted += len(batch)
        progress_bar.progress(inserted / total)
        status_text.info(f"Enviando registros: {inserted:,} de {total:,}".replace(",", "."))

    progress_bar.progress(1.0)
    status_text.success(f"Upload concluído: {inserted:,} registros enviados.".replace(",", "."))


def send_aging_file(file):
    try:
        df = read_uploaded_file(file)
        st.info(f"Arquivo lido com sucesso. Linhas encontradas: {len(df)}")

        df = prepare_aging(df)
        st.info("Tratamento da base concluído com sucesso.")

        df = clean_aging_dataframe_for_upload(df)

        if "aging_day" in df.columns:
            st.write("Tipo da coluna aging_day no DataFrame:", df["aging_day"].dtype)
            with st.expander("Prévia da coluna aging_day no DataFrame"):
                st.write(df["aging_day"].head(20).tolist())

        records = dataframe_to_json_records(df)

        if not records:
            st.warning("O arquivo não possui registros para envio.")
            return

        with st.expander("Prévia dos 3 primeiros registros convertidos para envio"):
            st.json(records[:3])

        insert_in_batches("aging_raw", records, batch_size=1000)

        st.success("Base completa de Aging enviada com sucesso para o Supabase.")

        with st.expander("Visualizar amostra tratada"):
            st.dataframe(df.head(20), use_container_width=True, hide_index=True)

    except Exception as e:
        st.error(f"Erro no envio do arquivo de Aging: {e}")


def render_upload_page():
    st.markdown('<div class="section-title">Central de Upload</div>', unsafe_allow_html=True)
    st.write(
        "Faça o envio das bases operacionais para alimentar a análise do sistema. "
        "Agora o upload da base de Aging será realizado de forma completa, em lotes."
    )

    st.markdown("### Teste de conexão")
    if st.button("Testar conexão com Supabase"):
        test_supabase_connection()

    st.markdown("---")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown('<div class="card">', unsafe_allow_html=True)
        st.markdown('<div class="upload-label">Base de Aging</div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="upload-helper">Envie a base com os itens recebidos, status de OS, datas operacionais e custo líquido.</div>',
            unsafe_allow_html=True,
        )

        aging_file = st.file_uploader(
            "Selecione o arquivo de Aging",
            type=["csv", "xlsx", "xls"],
            key="aging"
        )

        if aging_file is not None:
            st.success(f"Arquivo selecionado: {aging_file.name}")

            if st.button("Enviar base completa de Aging"):
                send_aging_file(aging_file)

        st.markdown(
            """
            <div class="footer-note">
                O envio será feito em lotes para melhorar a estabilidade e evitar falhas em arquivos grandes.
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown("</div>", unsafe_allow_html=True)

    with col2:
        st.markdown('<div class="card">', unsafe_allow_html=True)
        st.markdown('<div class="upload-label">Base de Faturamento</div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="upload-helper">Vamos habilitar essa etapa logo depois de validar o upload completo do Aging.</div>',
            unsafe_allow_html=True,
        )

        st.file_uploader(
            "Selecione o arquivo de Faturamento",
            type=["csv", "xlsx", "xls"],
            key="faturamento"
        )

        st.info("Upload de faturamento será ativado na próxima etapa.")
        st.markdown("</div>", unsafe_allow_html=True)