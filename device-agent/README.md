# Liquida Device Agent

Agente nativo de diagnóstico executado dentro do aparelho.

## Arquitetura
- Bridge: detecta, instala/inicia o Agent e consolida os resultados.
- Android Agent: executa testes nativos no Android.
- iOS Agent: executa testes nativos no iPhone.
- Portal: mostra os 9 blocos e pede apenas validações humanas inevitáveis.

## Blocos
Audio, Bateria, Camera, Conectividade, Hardware, Pecas, Seguranca, Tela e Sensores.

## Regra
Dados físicos do aparelho devem vir do próprio dispositivo ou do canal USB do dispositivo. Nunca de histórico de estoque, voucher ou triagem anterior.

## Fluxo
1. Detectar aparelho.
2. Iniciar Agent.
3. Executar testes automáticos em paralelo.
4. Complementar pelo canal USB quando a plataforma exigir.
5. Solicitar somente validações perceptivas.
6. Consolidar resultado.
7. Remover o Agent quando aplicável.
