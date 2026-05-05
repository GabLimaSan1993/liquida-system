import streamlit as st
import pandas as pd


def render_analysis_page():
    st.markdown('<div class="section-title">Análise por Fornecedor</div>', unsafe_allow_html=True)
    st.write(
        "Acompanhe o volume recebido, o volume vendido e os itens ainda sem saída. "
        "Essa visão será a base para a futura análise de margem e alocação de recursos."
    )

    dados_exemplo = pd.DataFrame(
        [
            {
                "fornecedor": "Fornecedor A",
                "itens_recebidos": 120,
                "itens_vendidos": 80,
                "nao_vendidos": 40,
                "status_os_predominante": "Encerrado / Disponível"
            },
            {
                "fornecedor": "Fornecedor B",
                "itens_recebidos": 90,
                "itens_vendidos": 55,
                "nao_vendidos": 35,
                "status_os_predominante": "Em processo"
            },
            {
                "fornecedor": "Fornecedor C",
                "itens_recebidos": 150,
                "itens_vendidos": 110,
                "nao_vendidos": 40,
                "status_os_predominante": "Encerrado / Disponível"
            },
        ]
    )

    fornecedor = st.selectbox(
        "Selecione o fornecedor",
        ["Todos"] + dados_exemplo["fornecedor"].tolist()
    )

    if fornecedor != "Todos":
        dados_exemplo = dados_exemplo[dados_exemplo["fornecedor"] == fornecedor]

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Itens recebidos", int(dados_exemplo["itens_recebidos"].sum()))
    c2.metric("Itens vendidos", int(dados_exemplo["itens_vendidos"].sum()))
    c3.metric("Itens não vendidos", int(dados_exemplo["nao_vendidos"].sum()))
    c4.metric(
        "Taxa de saída",
        f"{(dados_exemplo['itens_vendidos'].sum() / dados_exemplo['itens_recebidos'].sum() * 100):.1f}%"
        if dados_exemplo["itens_recebidos"].sum() > 0 else "0.0%"
    )

    st.markdown("<br>", unsafe_allow_html=True)

    col1, col2 = st.columns([1.2, 1])

    with col1:
        st.markdown('<div class="card">', unsafe_allow_html=True)
        st.markdown("#### Resumo consolidado")
        st.dataframe(dados_exemplo, use_container_width=True, hide_index=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with col2:
        st.markdown('<div class="card">', unsafe_allow_html=True)
        st.markdown("#### Leitura gerencial")
        st.write(
            """
            - Itens recebidos mostram o volume de entrada por fornecedor.  
            - Itens vendidos indicam a capacidade de conversão em receita.  
            - Itens não vendidos ajudam a identificar capital parado.  
            - O status da OS mostra se o produto está pronto para venda ou ainda em processo.
            """
        )
        st.markdown("</div>", unsafe_allow_html=True)