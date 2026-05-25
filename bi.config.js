// bi.config.js — Astro Distribuidora
// Esconde todas as telas do template fin40 (sem dados). Só Astro PBI + Plano de Ação visíveis.
module.exports = {
  cliente: {
    nome: "Astro Distribuidora",
    subdomain: "astro-bi",
    coolify_app_uuid: "",
    cor_primaria: "#22d3ee",
  },
  fontes: { adapters: [] }, // sem adapter — dados gerados manualmente por scripts/build_astro_data.py
  pages: {
    geral: {
      overview: 'hidden',
      receita: 'hidden',
      despesa: 'hidden',
      fluxo: 'hidden',
      tesouraria: 'hidden',
      comparativo: 'hidden',
      relatorio: 'hidden',
      valuation: 'hidden',
      diary: 'hidden',
    },
    outros: {
      indicators: 'hidden',
      faturamento_produto: 'hidden',
      curva_abc: 'hidden',
      marketing: 'hidden',
      hierarquia: 'hidden',
      detalhado: 'hidden',
      profunda_cliente: 'hidden',
      crm: 'hidden',
      settings: 'hidden',
    },
  },
};
