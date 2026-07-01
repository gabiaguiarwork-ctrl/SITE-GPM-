# PROMPT — DASHBOARD GERENCIAL COMERCIAL GPM
## Para usar no Claude Code

---

## CONTEXTO DO PROJETO

Você vai construir um **dashboard gerencial comercial** para a empresa **GPM (Grupo GPM)**.

O sistema centraliza o funil comercial de **4 unidades de negócio**:
- **MDO E TECNOLOGIA** — Responsável: Victor Castro
- **MOVIMENTAÇÃO DE CARGA** — Responsável: Verônica
- **TECNOLOGIA EM OP. INDUSTRIAIS** — Responsável: Renan Braga
- **TROPHEUS** — Responsável: Fellipe

A gestora do funil é **Gabriela**, que centraliza todas as unidades e reporta para **Eduardo Pitombo Mesquita**.

O funil vai **somente até a assinatura do contrato**. Pós-assinatura não é escopo deste sistema.

---

## DADOS REAIS DO FUNIL (base atual: 99 negociações)

### Pipeline total: R$ 762.669.831,54

| Temperatura | Valor | Qtd |
|---|---|---|
| QUENTE | R$ 542.675.985,58 | 20 |
| MORNO | R$ 24.718.235,11 | 5 |
| FRIO | R$ 195.275.610,85 | 71 |
| (sem info) | — | 3 |

### Por Unidade de Negócio:

| Unidade | Deals | Valor Total |
|---|---|---|
| MDO E TECNOLOGIA | 34 | R$ 657.670.300 |
| MOVIMENTAÇÃO DE CARGA | 7 | R$ 39.448.770 |
| TECNOLOGIA EM OP. INDUSTRIAIS | 56 | R$ 32.650.740 |
| TROPHEUS | 2 | R$ 32.900.000 |

### Etapas do funil (em ordem):
1. LEAD GERADO (57 deals / R$ 17,3M)
2. QUALIFICADO (12 deals / R$ 164,8M)
3. ANÁLISE TÉCNICA (4 deals / R$ 0)
4. PESQUISA DE PREÇOS (1 deal / R$ 105K)
5. PROPOSTA ENVIADA (17 deals / R$ 541,3M)
6. NEGOCIAÇÃO (4 deals / R$ 33,3M)
7. KICK-OFF INTERNO (4 deals / R$ 5,6M)

---

## ESTRUTURA DO ARQUIVO DE DADOS

O arquivo fonte é um `.xlsx` exportado do RD Station CRM com as seguintes colunas:

```
Data da Criação | Nome | Empresa | Funil de vendas | Etapa | Valor |
Temperatura | Fonte | Responsável | Produtos | Licitações |
Lote da Licitações | Contatos | Cargo | Email | Telefone
```

O sistema deve ser capaz de **importar esse arquivo xlsx** e atualizar os dados automaticamente.

---

## O QUE CONSTRUIR

### Stack recomendada:
- **Backend**: Python (FastAPI ou Flask) ou Node.js (Express)
- **Frontend**: React + Tailwind CSS
- **Leitura de dados**: pandas (Python) ou xlsx (Node.js)
- **Gráficos**: Recharts ou Chart.js
- **Banco**: SQLite ou simplesmente leitura direta do xlsx (começar simples)

---

## ABA 1 — DASHBOARD GERAL (visão executiva)

### Painel de KPIs no topo (cards):
- **Pipeline Total**: R$ 762.669.831,54
- **Deals Quentes**: R$ 542.675.985,58 (20 deals)
- **Deals Mornos**: R$ 24.718.235,11 (5 deals)
- **Deals Frios**: R$ 195.275.610,85 (71 deals)
- **Total de Negociações Ativas**: 99

### Gráfico 1 — Pipeline por Unidade de Negócio:
- Gráfico de barras horizontais
- Cada barra = 1 unidade de negócio
- Valor total em R$ + quantidade de deals
- Cor diferente por unidade

### Gráfico 2 — Distribuição por Temperatura:
- Gráfico de rosca (donut chart)
- QUENTE = vermelho/laranja, MORNO = amarelo, FRIO = azul

### Gráfico 3 — Pipeline por Etapa:
- Gráfico de funil ou barras verticais
- Mostrar valor total e quantidade de deals por etapa
- Seguindo a ordem: Lead Gerado → Qualificado → Análise Técnica → Pesquisa de Preços → Proposta Enviada → Negociação → Kick-Off Interno

### Tabela — Top 10 maiores oportunidades:
| Nome | Empresa | Unidade | Etapa | Valor | Temperatura | Responsável |
- Ordenado por valor decrescente
- Cor de linha por temperatura (vermelho/amarelo/azul suave)

### Filtros globais (afetam todo o dashboard):
- Filtro por Unidade de Negócio (multi-select)
- Filtro por Temperatura
- Filtro por Responsável
- Filtro por Período (Data da Criação)

---

## ABA 2 — FUNIL POR UNIDADE DE NEGÓCIO

### Seletor de unidade:
- 4 abas ou dropdown: MDO E TECNOLOGIA / MOVIMENTAÇÃO DE CARGA / TECNOLOGIA EM OP. INDUSTRIAIS / TROPHEUS

### Para cada unidade, exibir:

**Sub-KPIs da unidade:**
- Total do pipeline da unidade
- Qtd de deals quentes / mornos / frios
- Deal de maior valor em andamento

**Kanban / Funil visual:**
- Colunas = etapas do funil (na ordem correta)
- Cards arrastáveis de uma etapa para outra
- Cada card mostra:
  - Nome da negociação
  - Empresa
  - Valor (se houver)
  - Temperatura (cor do card: vermelho=quente, amarelo=morno, azul=frio)
  - Responsável
  - Data de criação

**Ao clicar em um card, abrir painel lateral com:**
- Nome completo da negociação
- Empresa
- Valor
- Etapa atual
- Temperatura
- Fonte (como chegou o lead)
- Produtos/serviços
- Informações de licitação (se houver)
- **Contatos da empresa**: Nome, Cargo, Email, Telefone
- **Histórico de atividades** (campo de registro livre — adicionar anotações com data/hora)
- **Lembretes** (criar lembrete com data)

---

## ABA 3 — REGISTRO DE ATIVIDADES (log de negociações)

- Tabela completa de todas as negociações com todos os campos
- Busca por texto (empresa, nome, contato)
- Filtros: unidade, etapa, temperatura, responsável, período
- Exportar para CSV ou Excel
- Cada linha expansível mostrando o histórico de atividades da negociação

---

## FUNCIONALIDADES ESSENCIAIS

### Importação de dados:
- Botão "Atualizar dados" que lê o arquivo xlsx e atualiza o sistema
- Ou upload direto de novo arquivo xlsx
- Os dados adicionados manualmente (histórico, lembretes) devem **persistir** mesmo após reimportação

### Persistência de dados adicionais:
- O sistema deve ter um banco de dados separado (SQLite) para:
  - Histórico de atividades por negociação (linked por nome+empresa como chave)
  - Lembretes com data
  - Status de kanban (etapa atual pode ser editada no sistema)

### Identidade visual:
- Cor primária: **Navy Blue (#1F3864)**
- Cor secundária: **Gold/Âmbar (#C9A84C)**
- Fonte: Roboto ou Inter (limpa, executiva)
- Cards brancos com bordas sutis
- Header escuro navy
- Estilo: **executivo, limpo, gerencial** — sem excessos decorativos
- Deve parecer um sistema profissional de CRM/BI

---

## REGRAS DE NEGÓCIO IMPORTANTES

1. O funil vai **somente até assinatura do contrato**. Não existe etapa pós-contrato.
2. Existem **4 unidades de negócio** com funis independentes mas com visão consolidada no dashboard.
3. **Temperatura** classifica a urgência/maturidade do deal: QUENTE > MORNO > FRIO.
4. Deals sem valor preenchido devem aparecer como "A definir" (não como zero).
5. A etapa **KICK-OFF INTERNO** indica que o contrato foi fechado e está iniciando — é a última etapa visível no sistema.
6. O campo **Licitações** indica se é uma negociação via processo licitatório público.
7. O responsável é sempre um dos 4 líderes de unidade: Victor Castro, Verônica, Renan Braga, Fellipe.

---

## ORDEM DE PRIORIDADE DE CONSTRUÇÃO

1. **Estrutura base** (leitura do xlsx, banco SQLite, API)
2. **Aba 1** — Dashboard com KPIs + gráficos
3. **Aba 2** — Funil kanban por unidade
4. **Aba 3** — Tabela de registros com busca e filtros
5. **Painel lateral** de detalhes com histórico e lembretes
6. **Upload/atualização** de arquivo xlsx

---

## ENTREGÁVEL ESPERADO

- Aplicação rodando localmente via `npm start` ou `python app.py`
- Pasta organizada: `/frontend` e `/backend` (ou fullstack se preferir Next.js)
- README com instruções de instalação
- O arquivo `FUNIL_MDO_corrigido.xlsx` já carregado como dados iniciais

---

**Observação final:** Este sistema vai substituir o RD Station CRM no futuro. Construa pensando em escalabilidade — no futuro serão adicionadas mais unidades de negócio (Felipe/Pedro e Rodrigo) e funcionalidades como integração com portais de licitação (Ariba).
