# 📖 Samuel's Bible Quest — Atos 9:8 – 11:16

Jogo de estudo para o Samuel se preparar para o **Adventurer Bible Game (ABG)**.
A parte dele é **Atos 9:8 – 11:16** (100 versículos). Tudo roda no navegador: não precisa de servidor, de login nem de instalação.

## Como abrir

- **No computador:** abra o `index.html` no Chrome, Edge ou Safari.
- **No tablet ou celular (recomendado):** publique no GitHub Pages em *Settings → Pages → Deploy from a branch*, escolhendo o branch e a pasta `/ (root)`. Depois é só abrir o link e "Adicionar à tela inicial".

O progresso fica salvo no navegador do aparelho. Para passar para outro aparelho, use a **Área dos pais → Export / Import progress**.

## Como o jogo funciona

| Parte | O que faz |
|---|---|
| 🗺️ **Mapa com 6 mundos + chefão final** | Cada mundo é um trecho da passagem (ver abaixo). Vencer o chefe libera o próximo mundo. |
| 📖 **1. Estudar** | Leitura com **áudio**. O versículo atual fica destacado e **cada palavra acende** enquanto é lida. Tem velocidade (🐢/🙂/🐇), repetição 🔁, "tocar a partir deste versículo" e **modo memória** 🙈, que esconde as palavras para ele tentar recitar. |
| ⚔️ **2. Treino (20 questões)** | Questões de múltipla escolha com A/B/C/D. Com **12/20** o chefe é liberado. |
| 👹 **3. Chefe (20 questões)** | O chefe tem barra de vida e o Samuel tem **5 ❤️**. Precisa de **16/20** (80%) para vencer. Tem cronômetro de 30 s por questão, que pode ser desligado. Ganha ⭐ (16–17), ⭐⭐ (18–19) ou ⭐⭐⭐ (20). |
| 🐲 **Chefão final** | 20 questões de toda a passagem, incluindo "em que capítulo está este versículo?". Vencer dá o título de **Bible Champion 🏆**. |
| 🩹 **Corrigir erros** | Toda questão errada entra na lista de revisão. Na revisão ele **ouve e acompanha o versículo** primeiro e depois responde de novo. Acertando **2 vezes**, o erro some. Erros antigos também voltam nas rodadas normais. |
| 🎁 **Missão diária** | 10 questões por dia, priorizando os erros. Mantém a sequência de dias 🔥. |
| 📈 **Meu progresso** | Gráfico das últimas rodadas com a linha de meta de 80%, domínio por mundo e um **mapa dos 100 versículos** colorido por acerto (vermelho, amarelo, verde). Tocar em um quadrado abre aquele versículo. |
| 🏅 **Medalhas, níveis, moedas e loja** | XP, níveis com títulos ("Little Lamb" até "Bible Champion"), combos 🔥, bônus de velocidade ⚡, 17 medalhas e uma loja de avatares comprados com moedas 🪙. |

### Mundos

1. **Darkness in Damascus** — Atos 9:8–19 (Saulo cego, Ananias)
2. **Escape Over the Wall** — Atos 9:20–31 (o cesto, Barnabé)
3. **Miracles of Peter** — Atos 9:32–43 (Eneias, Dorcas)
4. **Two Visions** — Atos 10:1–23 (Cornélio, o lençol)
5. **The Good News for All** — Atos 10:24–48 (Espírito Santo sobre os gentios)
6. **Peter's Report** — Atos 11:1–16

### Questões

- **~170 questões escritas à mão**, cada uma com a referência do versículo, em `js/questions.js`. As respostas foram escritas para valer tanto na **KJV** quanto na **NKJV**. Quando a palavra muda entre as versões, as duas aparecem, por exemplo "Holy Spirit (Holy Ghost)" ou "Sharon (Saron)".
- **Questões "complete o versículo"** geradas automaticamente a partir do texto, então cada rodada é diferente.
- O jogo prioriza as questões que ele **nunca viu** ou nas quais **mais erra**.

## ⚠️ KJV x NKJV

O ABG usa a **NKJV**, mas a NKJV tem direitos autorais (Thomas Nelson) e não pode ser incluída no repositório. Por isso o app já vem com a **King James Version (KJV)**, que é de domínio público.

Se vocês tiverem a NKJV, entrem em **⚙️ Parents area** (no fim do mapa), colem os versículos (um por linha, por exemplo `9:8 Then Saul arose from the ground...`) e cliquem em **Import text**. A partir daí a leitura, o áudio e as questões "complete o versículo" passam a usar o texto da NKJV.

## Área dos pais

Fica no fim do mapa e é protegida por uma continha de multiplicação. Lá dá para:

- trocar o nome;
- escolher a voz em inglês (as vozes "Google US English", "Samantha" e "Microsoft … Natural" são as melhores);
- ligar ou desligar o cronômetro e os sons;
- **liberar todos os mundos**;
- importar o texto NKJV;
- exportar, importar ou zerar o progresso.

## Arquivos

```
index.html        página principal
css/style.css     visual
js/verses.js      texto KJV de Atos 9:8–11:16
js/questions.js   mundos, chefes e banco de questões (fácil de editar/adicionar)
js/app.js         jogo: mapa, quiz, chefes, revisão, áudio, progresso, loja
```

Para adicionar questões, edite `js/questions.js` seguindo o formato
`["9:11", "Pergunta?", "Resposta certa", "errada 1", "errada 2", "errada 3"]`.
