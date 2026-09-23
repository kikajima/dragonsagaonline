# Dragon Saga Online - Colyseus Server

Servidor multiplayer em tempo real do DSO.

## Desenvolvimento local

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

O servidor inicia por padrão em `http://localhost:2567`.

Teste de saúde:

```text
http://localhost:2567/health
```

## Variáveis

- `SUPABASE_URL`: URL do projeto Supabase.
- `SUPABASE_PUBLISHABLE_KEY`: chave pública do projeto.
- `CLIENT_ORIGIN`: origem do frontend (ex.: Vercel).
- `PORT`: porta fornecida pelo host.

O cliente autentica no Supabase e envia o access token para o Colyseus. O servidor consulta `characters` usando esse token; o RLS do Supabase garante que o personagem pertence à conta autenticada.

## Produção

Hospede esta pasta como um serviço Node persistente (Railway, Render, Fly.io, VPS ou Colyseus Cloud). Depois configure no frontend:

```text
NEXT_PUBLIC_COLYSEUS_URL=https://seu-servidor-multiplayer.example.com
```

Não hospede este servidor como uma Serverless Function comum: ele precisa manter conexões WebSocket abertas.
