# 📖 Bible Quest — Adventurer Bible Game (Atos 1–16)

App de estudo gamificado para a equipe do **ABG 2026 (Dallas, 5 de dezembro)**.
Cada criança faz o próprio cadastro, escolhe a sua passagem (100 versículos) e estuda só a sua parte.

| # | Criança | Passagem |
|---|---|---|
| 1 | Alexandrea | Acts 1:1 – 4:1 |
| 2 | Noah | Acts 4:2 – 7:7 |
| 3 | Naomi Bate | Acts 7:8 – 9:7 |
| 4 | Samuel | Acts 9:8 – 11:16 |
| 5 | Edel | Acts 11:17 – 14:9 |
| 6 | PB | Acts 14:10 – 16:40 |

## Tecnologia

- **Next.js 15** (hospedado no **Vercel**)
- **Supabase**: login (email e senha), banco Postgres com Row Level Security
- **Texto NKJV** guardado no banco. Ele **não** fica neste repositório, que é público: só quem fez login consegue ler.
- **Vídeos NKJV do YouTube** (canal "23:59 TIME IS UP"), um por capítulo, tocados no player oficial do YouTube

## O que o jogo tem

- **Mapa de mundos.** Cada passagem tem de 6 a 7 mundos, e cada mundo tem 3 etapas: Estudar, Treino (20 questões) e Chefe (20 questões, 5 ❤️, precisa de 16 acertos). No fim vem o chefão final.
- **Leitura com vídeo.** O vídeo da NKJV toca e o versículo e a palavra que estão sendo lidos acendem.
  - Para isso, os versículos precisam ser **sincronizados uma vez**: botão 🎯 *Sync verses*, tocando no início de cada versículo.
  - A sincronização fica salva para todo mundo.
  - Também existe o modo "robot voice", com a voz do aparelho.
- **Revisão de erros** com repetição espaçada: ler e ouvir o versículo, depois responder de novo.
- **XP, níveis, moedas, medalhas, loja de avatares**, sequência de dias seguidos e missão diária.
- **My Team**: ranking pelo % da **própria passagem** dominada.
- **Progresso salvo na nuvem**, então dá para continuar em qualquer aparelho.

## Estrutura

```
app/                      telas Next.js (login, cadastro, escolha da passagem, jogo)
lib/engine.js             motor do jogo (mapa, quiz, chefes, revisão, leitura com vídeo)
lib/content.ts            carrega a passagem do Supabase
lib/supabase.ts           cliente Supabase (URL e chave pública)
content/passages.json     passagens, mundos e vídeos do YouTube (sem texto bíblico)
content/questions/*.json  perguntas escritas à mão (por passagem)
supabase/migrations/      estrutura do banco + regras de acesso
scripts/seed.py           gera o SQL para carregar passagens, mundos, perguntas e versículos
legacy/                   versão 1 (HTML estático, KJV)
```

## Rodar localmente

```bash
npm install
npm run dev
```

## Deploy no Vercel

1. Em vercel.com, entre com o GitHub e clique em **Add New → Project**.
2. Importe o repositório `samuel-bible-game`.
3. Clique em **Deploy**. As variáveis do Supabase já têm valores padrão no código; se quiser, copie as do `.env.example`.
