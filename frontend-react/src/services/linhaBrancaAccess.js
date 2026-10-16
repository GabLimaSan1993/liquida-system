const BASE = "/v2/linha-branca";
const AREAS = ["refrigeracao", "climatizacao", "lavadoras"];

// Existing technical profiles keep their area until V2 permissions are saved.
// Once V2 permissions exist, only the selected screens are available.
export function hasLinhaBrancaAccess(profile, tela) {
  if (!profile || !(tela === BASE || tela.startsWith(`${BASE}/`))) return false;
  if (profile.is_master) return true;

  const telas = profile.telas_permitidas || [];
  const explicitas = telas.filter((rota) => rota === BASE || rota.startsWith(`${BASE}/`));
  if (explicitas.length) {
    if (tela === BASE) return true;
    if (explicitas.includes(tela)) return true;
    return AREAS.some((area) => tela === `${BASE}/${area}` &&
      explicitas.some((rota) => rota.startsWith(`${tela}/`)));
  }

  const area = profile.area_tecnica;
  const legado = telas.some((rota) => rota.startsWith("/linha-branca/"));
  if (tela === BASE) return legado || [...AREAS, "diversos"].includes(area);
  const areaDaRota = tela.slice(BASE.length + 1).split("/")[0];
  if (!AREAS.includes(areaDaRota)) return false;
  return AREAS.includes(area) ? areaDaRota === area : legado;
}
