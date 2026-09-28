import { supabase } from "../lib/supabase.js";

function periodoIso(ano, mes) {
  const a = Number(ano);
  const m = mes ? Number(mes) : null;

  if (!m) {
    return {
      inicio: `${a}-01-01T00:00:00-03:00`,
      fim: `${a + 1}-01-01T00:00:00-03:00`,
    };
  }

  const proxAno = m === 12 ? a + 1 : a;
  const proxMes = m === 12 ? 1 : m + 1;

  return {
    inicio: `${a}-${String(m).padStart(2, "0")}-01T00:00:00-03:00`,
    fim: `${proxAno}-${String(proxMes).padStart(2, "0")}-01T00:00:00-03:00`,
  };
}

export async function buscarResumoMargemB2C({ ano, mes = null }) {
  const { inicio, fim } = periodoIso(ano, mes);

  const { data, error } = await supabase.rpc("margem_b2c_resumo_gabriel", {
    p_inicio: inicio,
    p_fim: fim,
  });

  if (error) throw new Error(error.message);

  return data?.[0] || {
    itens_faturados: 0,
    itens_com_margem: 0,
    itens_sem_margem: 0,
    cobertura_pct: 0,
    receita_vinculada: 0,
    custo_entrada: 0,
    margem_rs: 0,
    margem_pct_ponderada: 0,
    aging_medio_dias: null,
  };
}

export async function buscarMargemMensalB2C(ano) {
  const { data, error } = await supabase.rpc("margem_b2c_mensal_gabriel", {
    p_ano: Number(ano),
  });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function buscarDetalheMargemB2C({
  ano,
  mes = null,
  status = "todos",
  busca = "",
  pagina = 1,
  porPagina = 50,
}) {
  const { inicio, fim } = periodoIso(ano, mes);
  const from = Math.max(0, (pagina - 1) * porPagina);
  const to = from + porPagina - 1;

  let query = supabase
    .from("vw_margem_b2c_gabriel")
    .select(
      [
        "pedido_item_id",
        "id_anymarket",
        "item_seq",
        "marketplace",
        "numero_nf",
        "faturado_em",
        "titulo_produto",
        "sku_produto",
        "sku_alocado",
        "grade_produto",
        "grade_alocada",
        "imei_final",
        "preco_venda",
        "voucher_liquida",
        "voucher_tradein",
        "data_tradein",
        "custo_entrada",
        "valor_trade_in",
        "valor_campanha",
        "rede",
        "loja",
        "margem_rs",
        "margem_pct",
        "aging_ate_venda_dias",
        "status_margem",
      ].join(","),
      { count: "exact" }
    )
    .gte("faturado_em", inicio)
    .lt("faturado_em", fim)
    .order("faturado_em", { ascending: false });

  if (status === "com_margem") {
    query = query.eq("status_margem", "margem_calculavel");
  } else if (status === "sem_margem") {
    query = query.neq("status_margem", "margem_calculavel");
  }

  const q = busca.trim();
  if (q) {
    if (/^\d+$/.test(q) && q.length >= 7 && q.length <= 12) {
      query = query.eq("id_anymarket", Number(q));
    } else {
      const seguro = q.replaceAll(",", " ").replaceAll("(", " ").replaceAll(")", " ");
      query = query.or(
        [
          `imei_final.ilike.%${seguro}%`,
          `voucher_tradein.ilike.%${seguro}%`,
          `voucher_liquida.ilike.%${seguro}%`,
          `numero_nf.ilike.%${seguro}%`,
          `titulo_produto.ilike.%${seguro}%`,
          `sku_produto.ilike.%${seguro}%`,
          `sku_alocado.ilike.%${seguro}%`,
        ].join(",")
      );
    }
  }

  const { data, error, count } = await query.range(from, to);

  if (error) throw new Error(error.message);

  return {
    rows: data || [],
    total: count || 0,
    pagina,
    porPagina,
  };
}
