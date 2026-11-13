# TaMi Orçamentos (iPhone)

Calculadora de orçamentos e lista de orçamentos guardados, para o iPhone. É uma web app
(HTML/CSS/JS sem build) que se instala no ecrã principal pelo Safari: não precisa de conta
Apple Developer nem expira.

- **Calculadora**: várias peças (filamento, gramas, horas/minutos de impressão, quantidade),
  trabalho, tintas, embalagem, envio, lucro e preço combinado. Contas iguais a `app/custos.py`.
- **Orçamentos**: guardados com nome, foto e notas; editar, duplicar, partilhar e apagar.
- **Definições**: preços dos filamentos, eletricidade, impressora, margens. Valores iniciais
  copiados de `data/custos.json` (nov 2026). Exportar/importar cópia de segurança em JSON.

Tudo fica no próprio iPhone (localStorage + IndexedDB). Nada é enviado para servidor nenhum.

## Testar no Mac

    python3 -m http.server 8770 --directory telemovel

## Pôr no iPhone

Tem de estar alojada em HTTPS (ex.: GitHub Pages, Cloudflare Pages). No iPhone: abrir o
endereço no Safari › Partilhar › **Adicionar ao ecrã principal**.

Ao mudar ficheiros, subir `VERSAO` em `sw.js` para o iPhone apanhar a versão nova.
