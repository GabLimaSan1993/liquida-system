export const normalizarAging = (valor) => String(valor ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");

// O exportador ALS produz campos sem aspas de proteção e aspas literais em textos.
// No formato sem proteção, cada linha física é uma OS; não juntar linhas por aspas.
function camposLinha(linha, delimitador, protegido) {
  if (!protegido) return linha.split(delimitador);
  const campos = []; let valor = ""; let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"' && (aspas || valor === "")) {
      if (aspas && linha[i + 1] === '"') { valor += '"'; i++; }
      else aspas = !aspas;
    } else if (c === delimitador && !aspas) { campos.push(valor); valor = ""; }
    else valor += c;
  }
  if (aspas) throw new Error("Campo com aspas incompletas.");
  campos.push(valor); return campos;
}

export function dataAging(valor) {
  const m = String(valor || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export function dataNomeArquivo(nome) {
  const m = String(nome).match(/(\d{2})[_-](\d{2})[_-](\d{4})/);
  return m ? dataAging(`${m[1]}/${m[2]}/${m[3]}`) : "";
}

export function categoriaAging(tipo) {
  const t = normalizarAging(tipo);
  if (/^LAVA(?:DORA)? E SECA\b/.test(t)) return "Lava e Seca";
  if (/^LAVADORA(?: DE ROUPAS?)?$/.test(t)) return "Lavadora";
  if (/^SECADORA/.test(t)) return "Secadora";
  if (/^LAVA[ -]?LOUCAS?/.test(t)) return "Lava Louças";
  if (/^(AR CONDICIONADO|CONDENSADORA|EVAPORADORA|CLIMATIZADOR)/.test(t)) return "Ar-condicionado";
  if (/^(REFRIGERADOR|FREEZER|FRIGOBAR|ADEGA|CERVEJEIRA)/.test(t)) {
    return ({ REFRIGERADOR: "Refrigerador", FREEZER: "Freezer", FRIGOBAR: "Frigobar", ADEGA: "Adega", CERVEJEIRA: "Cervejeira" })[t] || tipo.trim();
  }
  return tipo.trim();
}

export function etapaAging(etapa) {
  const e = normalizarAging(etapa);
  if (/SCRAP|SUCATA/.test(e)) return { status: "Scrap", etapa: "Scrap", area: "Scrap" };
  if (/VENDA NO ESTADO/.test(e)) return { status: "Venda no estado", etapa: "Venda no estado", area: null };
  if (/EXPEDID|ENCERRAD|GERACAO DE MINUTA/.test(e)) return { status: "Finalizado", etapa: "Aprovado", area: null };
  if (/ESTOQUE VENDA|CMP\/HF/.test(e)) return { status: "Aprovado", etapa: "Aprovado", area: null };
  if (/QCC|QUALIDADE|EMBALAGEM/.test(e)) return { status: "Qualidade", etapa: "Qualidade", area: "Qualidade" };
  if (/LIMPEZA|HIGIENIZA/.test(e)) return { status: "Limpeza", etapa: "Limpeza", area: "Limpeza" };
  if (/^AGUARDANDO CMP$/.test(e)) return { status: "Aguardando peça", etapa: "Reparo", area: "Reparo" };
  if (/COMPONENTE|AGUARDANDO PECA/.test(e)) return { status: "Aguardando peça", etapa: "Reparo", area: "Reparo" };
  if (/REPARO|LABORATORIO|ENGENHARIA|COLAGEM/.test(e)) return { status: "Em reparo", etapa: "Reparo", area: "Reparo" };
  if (/BANCADA|TESTE/.test(e)) return { status: "Bancada de Testes", etapa: "Bancada de Testes", area: "Bancada de Testes" };
  if (/KIT/.test(e)) return { status: "Triado - aguardando kit", etapa: "Aguardando kit", area: "Formação de Kit" };
  if (/^(PCP|AGUARDANDO ATRIBUICAO|AGUARDANDO TRIAGEM|RECEBIDO|TRIAGEM)$/.test(e)) return { status: "Aguardando triagem", etapa: "Aguardando triagem", area: null };
  return null;
}

export function parseAgingLinhaBranca(texto) {
  const linhas = texto.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/).filter(l => l.trim());
  if (!linhas.length) throw new Error("O arquivo está vazio.");
  const delimitador = linhas[0].includes(";") ? ";" : "\t";
  const protegido = /^"num_OS"/.test(linhas[0]);
  const cabecalho = camposLinha(linhas[0], delimitador, protegido).map(v => v.trim());
  const obrigatorias = ["num_OS", "categoria_produto", "tipo_prod", "ETAPA", "Marca", "Dt_Abert", "Modelo", "SerialIn", "descricaoProduto"];
  const faltantes = obrigatorias.filter(c => !cabecalho.includes(c));
  if (faltantes.length) throw new Error(`Colunas ausentes: ${faltantes.join(", ")}. Utilize o Relatório Aging Personalizado.`);
  const registros = new Map(); const erros = []; const tipos = {};
  let outrasCategorias = 0; let repetidas = 0;
  for (let i = 1; i < linhas.length; i++) {
    let campos;
    try { campos = camposLinha(linhas[i], delimitador, protegido); }
    catch (err) { erros.push({ linha: i + 1, motivo: err.message }); continue; }
    // Mesmo linhas inválidas de outras categorias não devem bloquear a Linha Branca.
    if (normalizarAging(campos[cabecalho.indexOf("categoria_produto")]) !== "LINHA BRANCA") {
      outrasCategorias++; continue;
    }
    if (campos.length !== cabecalho.length) {
      erros.push({ linha: i + 1, motivo: `Quantidade de colunas inválida (${campos.length}/${cabecalho.length}).` }); continue;
    }
    const origem = Object.fromEntries(cabecalho.map((c, j) => [c, campos[j].trim()]));
    const numero_os = origem.num_OS;
    const data = dataAging(origem.Dt_Abert);
    const categoria = categoriaAging(origem.tipo_prod);
    const fluxo = etapaAging(origem.ETAPA);
    if (!/^\d+$/.test(numero_os) || !data || !categoria || !origem.Marca || !fluxo) {
      erros.push({ linha: i + 1, os: numero_os, motivo: !fluxo ? `Etapa não reconhecida: ${origem.ETAPA}` : "OS, data de abertura, marca ou tipo inválido." }); continue;
    }
    const registro = { numero_os, dt_entrada: data, categoria, marca: origem.Marca,
      modelo: origem.Modelo || null, serial_number: origem.SerialIn || origem.SerialOut || origem.serialNumber || null,
      fornecedor: origem.nome_cliente || origem.clienteOrigem || null,
      lote: origem.idLote || null, numero_nf: origem.num_NF || null,
      voltagem: origem.Banda || null, status_atual: fluxo.status, etapa_atual: fluxo.etapa,
      area_destino: fluxo.area, dados_origem: origem };
    if (registros.has(numero_os)) {
      if (JSON.stringify(registros.get(numero_os)) !== JSON.stringify(registro)) {
        erros.push({ linha: i + 1, os: numero_os, motivo: "OS repetida com dados divergentes." });
      } else repetidas++;
      continue;
    }
    registros.set(numero_os, registro);
    tipos[origem.tipo_prod] = (tipos[origem.tipo_prod] || 0) + 1;
  }
  return { registros: [...registros.values()], total: linhas.length - 1, outrasCategorias, repetidas, erros, tipos };
}
