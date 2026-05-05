export const defaultFilters = {
  fornecedor: "",
  ano: "",
  mes: "",
  semana: "",
  dataInicial: "",
  dataFinal: "",
};

export function filtersFromSearchParams(searchParams) {
  return {
    fornecedor: searchParams.get("fornecedor") || "",
    ano: searchParams.get("ano") || "",
    mes: searchParams.get("mes") || "",
    semana: searchParams.get("semana") || "",
    dataInicial: searchParams.get("dataInicial") || "",
    dataFinal: searchParams.get("dataFinal") || "",
  };
}

export function filtersToSearchParams(filters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value));
    }
  });

  return params;
}