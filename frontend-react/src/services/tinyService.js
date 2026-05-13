import { supabase } from "../lib/supabase";

export async function sincronizarTinyAno(ano) {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(
    "https://fndkyainfdiyorwdsvkr.supabase.co/functions/v1/sincronizar-tiny",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        ano_inicio: ano,
        ano_fim: ano,
      }),
    }
  );

  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Erro ao sincronizar");
  return data;
}