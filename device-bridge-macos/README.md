# Liquida Device Bridge — macOS

Serviço local da estação de Triagem Automática do Liquida.

## Objetivo

O operador usa somente o Liquida no navegador. Este processo roda em segundo plano no Mac e:
- detecta Android via ADB;
- detecta iPhone/iPad via libimobiledevice;
- coleta identificadores disponíveis, inclusive múltiplos IMEIs quando expostos pelo aparelho;
- coleta bateria, armazenamento e informações técnicas;
- executa diagnósticos automáticos;
- envia o resultado para o Liquida.

## Dependências

O instalador usa Homebrew para instalar:
- android-platform-tools
- libimobiledevice
- go (somente para compilar nesta fase LAB)

## Instalação LAB

No Mac da bancada:

```bash
chmod +x install.sh
./install.sh CODIGO_DE_PAREAMENTO
```

O código de pareamento é gerado dentro de **Liquida > Triagens > Triagem Automática — LAB**.

Depois da instalação o Bridge sobe automaticamente pelo LaunchAgent
`com.liquida.devicebridge`.

## Segurança

O token da estação fica apenas no Mac, em:
`~/Library/Application Support/LiquidaBridge/config.json`.

O Bridge não recebe chave de administrador do Supabase.

## Observação importante sobre IMEI no Android

Android 10+ restringe identificadores persistentes. O Bridge tenta múltiplas fontes ADB/OEM e valida IMEIs por Luhn.
Quando o fabricante/Android não expõe todos os IMEIs, a sessão retorna `manual_required` para completar a captura dentro do Liquida.
