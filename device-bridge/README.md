# Liquida Device Bridge — Multidevice

Serviço local da **Triagem Automática — LAB** com suporte a **macOS e Windows** e até **12 aparelhos simultâneos por estação**.

## Arquitetura

- Android: ADB, identificado pelo serial da conexão.
- iPhone/iPad: libimobiledevice, identificado pelo UDID.
- Cada aparelho recebe um slot lógico de 01 a 12 enquanto estiver conectado.
- Cada sessão recebe explicitamente plataforma + connection_id.
- Até 12 diagnósticos rodam em paralelo; o mesmo aparelho não executa dois diagnósticos simultaneamente.
- O Bridge anuncia ao Liquida os aparelhos conectados a cada heartbeat.

## macOS

Na pasta device-bridge:

    chmod +x install-macos.sh
    ./install-macos.sh CODIGO_DE_PAREAMENTO

O instalador usa Homebrew para instalar Android Platform Tools, libimobiledevice e Go, compila o Bridge e registra um LaunchAgent.

## Windows

Abra PowerShell na pasta device-bridge:

    Set-ExecutionPolicy -Scope Process Bypass
    .\install-windows.ps1 CODIGO_DE_PAREAMENTO

O instalador usa winget para instalar Android Platform Tools e Go, compila o Bridge e adiciona o processo à Inicialização do usuário.

### iPhone no Windows

O Bridge é compatível com iOS no Windows quando os drivers Apple e os executáveis idevice_id, ideviceinfo, idevicepair e idevicediagnostics estiverem disponíveis no PATH. Sem esses componentes, a estação Windows continua funcionando normalmente com Android.

## Bancada

Para 10–12 aparelhos, use hub USB alimentado externamente e com portas de dados. Evite hub passivo. Identifique fisicamente os cabos/portas para facilitar a operação.

## Teste

1. Gere um código em Liquida > Assurant Warehouse > Triagens > Triagem Automática — LAB.
2. Instale o Bridge no Windows ou Mac.
3. Conecte os aparelhos.
4. Android: ative Depuração USB e autorize o computador.
5. iPhone: desbloqueie e toque em Confiar.
6. Aguarde os aparelhos aparecerem nos slots.
7. Bipe o voucher em cada slot e inicie os diagnósticos.
