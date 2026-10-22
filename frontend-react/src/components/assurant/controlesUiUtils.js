export const numero=n=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
export const dataHora=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
