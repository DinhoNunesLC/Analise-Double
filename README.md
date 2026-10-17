# Análise Double

Painel em tempo real para o Blaze Double com dados da CodeBridge, Node.js e SQLite.

## Instalação

```bash
npm install
```

Copie o arquivo `.env.example` para `.env`, configure `APISCB_TOKEN` e execute:

```bash
npm start
```

Acesse `http://localhost` ou a porta definida em `PORT`.

## Modelo estatístico

- Preto: 1–7 (7/15).
- Vermelho: 8–14 (7/15).
- Branco: 0 (1/15).
- O sistema recebe resultados do canal `blazdouble` pelo WebSocket da APISCB e armazena somente resultados efetivamente recebidos.
- Probabilidades suavizadas: `lambda_i = (contagem_i + s * base_i) / (n + s)`.
- Modelo de corridas de processos de Poisson: `P(i proximo) = lambda_i / soma(lambda)`.
- Com amostra vazia, são exibidas apenas probabilidades teóricas.
- Avaliação retrospectiva sequencial disponível a partir de um histórico mínimo.

A metodologia mede frequências observadas; não prevê resultados independentes, nem identifica vantagens reais na roleta.

## Endpoints locais

- `GET /api/analysis`
- `GET /health`

## Configuração

```env
APISCB_TOKEN=seu_token_aqui
PORT=80
DATABASE_PATH=analise_double.db
ANALYSIS_WINDOW=120
PRIOR_STRENGTH=30
```

Não publique o token nem o arquivo `.env` no GitHub. Use armazenamento persistente para o SQLite na hospedagem.
