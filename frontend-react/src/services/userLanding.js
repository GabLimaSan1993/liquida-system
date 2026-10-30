import { hasLinhaBrancaAccess } from "./linhaBrancaAccess.js";

// Administrators choose an environment; operators go to their granted operation.
export function getUserLanding(profile) {
  if (!profile || profile.is_master) return "/sistemas";
  const telas = profile.telas_permitidas || [];
  if (telas.includes("/v2/assurant/laboratorio/reparos") && telas.every(t => t === "/v2/assurant" || t === "/v2/assurant/laboratorio/reparos"))
    return "/v2/assurant/laboratorio/reparos";
  if (telas.includes("/gerenciar-usuarios")) return "/sistemas";
  const base = "/v2/linha-branca";
  const linhaBranca = hasLinhaBrancaAccess(profile, base);
  const assurant = telas.includes("/v2/assurant");
  const outras = telas.filter(rota => !rota.startsWith(base) && !rota.startsWith("/v2/assurant"));

  if (linhaBranca && !assurant && !outras.length) {
    const areas = ["lavadoras", "refrigeracao", "climatizacao"]
      .map(area => `${base}/${area}`)
      .filter(rota => hasLinhaBrancaAccess(profile, rota));
    if (areas.length !== 1) return base;
    return telas.find(rota => rota === areas[0]) ||
      telas.find(rota => rota.startsWith(`${areas[0]}/`)) || areas[0];
  }
  if (assurant && !linhaBranca && !outras.length) return "/v2/assurant";
  if (!assurant && !linhaBranca && outras.length === 1) return outras[0];
  return "/sistemas";
}
