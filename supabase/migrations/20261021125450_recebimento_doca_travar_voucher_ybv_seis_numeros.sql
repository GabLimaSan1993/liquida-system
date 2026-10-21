create function liquida_private.validar_voucher_recebimento_doca()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  -- Registros históricos continuam preservados quando o voucher não é alterado.
  if tg_op='UPDATE' and new.voucher is not distinct from old.voucher then return new; end if;
  if new.voucher is null or length(new.voucher)<>9 or new.voucher !~ '^YBV[0-9]{6}$' then
    raise exception using errcode='23514',
      message='Voucher inválido: informe YBV seguido de exatamente 6 números. Exemplo: YBV123456.',
      constraint='recebimento_voucher_formato_ybv_6_digitos';
  end if;
  return new;
end; $$;
revoke all on function liquida_private.validar_voucher_recebimento_doca() from public,anon;
create trigger validar_voucher_recebimento_doca
before insert or update of voucher on public.recebimento_vouchers
for each row execute function liquida_private.validar_voucher_recebimento_doca();
