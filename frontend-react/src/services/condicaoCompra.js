export function codigoCondicaoCompra(condicao, sufixo = null) {
  const codigo = String(sufixo || "").trim().toUpperCase();
  if (codigo === "BM" || codigo === "TR") return codigo;
  const texto = String(condicao || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (["bm", "bom", "bons"].includes(texto)) return "BM";
  if (["tr", "trincado", "quebrado", "quebrados", "defeituoso", "defeituosos"].includes(texto)) return "TR";
  return null;
}
