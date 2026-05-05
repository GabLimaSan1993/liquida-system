import streamlit as st
from src.ui.styles import apply_styles
from src.ui.upload_page import render_upload_page
from src.ui.analysis_page import render_analysis_page

st.set_page_config(
    page_title="Liquida System",
    layout="wide",
    page_icon="📦"
)

apply_styles()

st.markdown(
    """
    <div class="hero-box">
        <div class="hero-title">Liquida System</div>
        <div class="hero-subtitle">
            Plataforma de inteligência operacional para acompanhamento de Aging, faturamento,
            disponibilidade de itens e performance por fornecedor.
        </div>
    </div>
    """,
    unsafe_allow_html=True
)

menu = st.sidebar.radio(
    "Menu",
    ["Upload de Bases", "Análise por Fornecedor"]
)

if menu == "Upload de Bases":
    render_upload_page()
else:
    render_analysis_page()