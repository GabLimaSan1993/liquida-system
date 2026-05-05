import streamlit as st


def apply_styles():
    st.markdown(
        """
        <style>
        :root {
            --lp-purple: #7E34A3;
            --lp-purple-dark: #5E2485;
            --lp-lilac: #B06AD9;
            --lp-orange: #EF6B27;
            --lp-yellow: #F4B400;
            --lp-pink: #C12F8A;
            --lp-white: #FFFFFF;
            --lp-bg: #F7F4FB;
            --lp-card: #FFFFFF;
            --lp-text: #1F1630;
            --lp-muted: #6E6280;
            --lp-border: rgba(126, 52, 163, 0.14);
            --lp-shadow: 0 10px 30px rgba(94, 36, 133, 0.12);
        }

        .stApp {
            background: linear-gradient(180deg, #F8F4FC 0%, #F4EFFA 100%);
            color: var(--lp-text);
        }

        section[data-testid="stSidebar"] {
            background: linear-gradient(180deg, #6F2E97 0%, #5B237F 100%);
            border-right: 1px solid rgba(255,255,255,0.08);
        }

        section[data-testid="stSidebar"] * {
            color: white !important;
        }

        .block-container {
            padding-top: 1.8rem;
            padding-bottom: 2rem;
            max-width: 1400px;
        }

        .main-title {
            font-size: 2.4rem;
            font-weight: 800;
            color: var(--lp-purple-dark);
            margin-bottom: 0.2rem;
            line-height: 1.1;
        }

        .sub-title {
            font-size: 1.02rem;
            color: var(--lp-muted);
            margin-bottom: 1.4rem;
        }

        .hero-box {
            background: linear-gradient(135deg, rgba(126,52,163,1) 0%, rgba(193,47,138,1) 55%, rgba(239,107,39,1) 100%);
            padding: 1.6rem 1.8rem;
            border-radius: 24px;
            color: white;
            box-shadow: 0 16px 36px rgba(126, 52, 163, 0.25);
            margin-bottom: 1.3rem;
        }

        .hero-title {
            font-size: 1.8rem;
            font-weight: 800;
            margin-bottom: 0.35rem;
        }

        .hero-subtitle {
            font-size: 1rem;
            opacity: 0.92;
        }

        .section-title {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--lp-purple-dark);
            margin-top: 0.4rem;
            margin-bottom: 0.8rem;
        }

        .card {
            background: var(--lp-card);
            border: 1px solid var(--lp-border);
            border-radius: 22px;
            padding: 1.2rem 1.2rem;
            box-shadow: var(--lp-shadow);
        }

        .mini-card {
            background: white;
            border: 1px solid var(--lp-border);
            border-radius: 18px;
            padding: 1rem 1rem;
            box-shadow: var(--lp-shadow);
            min-height: 110px;
        }

        .upload-label {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--lp-purple-dark);
            margin-bottom: 0.4rem;
        }

        .upload-helper {
            color: var(--lp-muted);
            font-size: 0.95rem;
            margin-bottom: 0.7rem;
        }

        div[data-testid="stMetric"] {
            background: white;
            border: 1px solid var(--lp-border);
            padding: 14px;
            border-radius: 18px;
            box-shadow: var(--lp-shadow);
        }

        div[data-testid="stFileUploader"] {
    background: #FFFFFF !important;
    border: 2px dashed rgba(126,52,163,0.35);
    border-radius: 18px;
    padding: 0.8rem;
}

/* Caixa interna do uploader */
div[data-testid="stFileUploader"] section {
    background: #FFFFFF !important;
    color: #1F1630 !important;
}

/* Texto dentro do uploader */
div[data-testid="stFileUploader"] * {
    color: #1F1630 !important;
}

/* Botão de upload */
div[data-testid="stFileUploader"] button {
    background: linear-gradient(135deg, #EF6B27 0%, #F4B400 100%) !important;
    color: white !important;
    border-radius: 10px !important;
    border: none !important;
    font-weight: 600;
}

        .stButton > button {
            background: linear-gradient(135deg, #EF6B27 0%, #F4B400 100%);
            color: white;
            border: none;
            border-radius: 14px;
            padding: 0.65rem 1.2rem;
            font-weight: 700;
            box-shadow: 0 10px 18px rgba(239, 107, 39, 0.22);
        }

        .stButton > button:hover {
            filter: brightness(1.03);
        }

        div[data-testid="stAlert"] {
            border-radius: 18px;
        }

        .footer-note {
            color: var(--lp-muted);
            font-size: 0.92rem;
            margin-top: 0.7rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )