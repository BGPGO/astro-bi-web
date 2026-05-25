// bi.config.js — gerado por `bgp-bi init` e editado manualmente.
// NUNCA commite credenciais aqui (use .env).
//
// Após editar, rode `node bgp-bi.cjs build` pra validar.
module.exports = {
  cliente: {
    nome: "<NOME DO CLIENTE>",        // ex: "RADKE Soluções Intralogísticas"
    subdomain: "<subdomain>",          // ex: "radke-bi" (vira radke-bi.<COOLIFY_HOST>.sslip.io)
    coolify_app_uuid: "",              // preenchido por bgp-bi init após provisionar
    cor_primaria: "#22d3ee",           // ciano default
  },

  // ============================================================
  // FONTES DE DADOS — multi-adapter (ver adapters/_CONTRACT.md)
  // Cada adapter normaliza pra schema canonical em data/movimentos.json
  // ============================================================
  fontes: {
    adapters: ["omie"],     // ou ["conta-azul"], ["manual-xlsx"], ou múltiplos: ["omie", "manual-xlsx"]

    // Adapter Omie — exige OMIE_APP_KEY/SECRET no .env
    omie: {
      bancos_ok: ["033", "748", "756"], // opcional — filtra por código banco (Santander/Sicredi/Sicoob)
    },

    // Adapter Conta Azul — exige CA_CLIENT_ID/SECRET/REFRESH_TOKEN no .env
    // conta_azul: {},

    // Adapter fin40 — BGP Financeira (Supabase multi-tenant)
    // Exige FIN40_SUPABASE_ANON, FIN40_EMAIL, FIN40_PASSWORD, FIN40_PROJECT_ID no .env
    // Doc canonical das lições: BGPGO/sopra-bi-web/FIN40_INTEGRATION_LESSONS.md
    // fin40: {
    //   cliente_label: "Nome Bonito",         // string mostrada no BI
    //   regime: "caixa",                       // "caixa" (default) ou "competencia"
    //   use_competencia: false,                // RPC switch (false = regime caixa)
    //   desconsiderar: true,                   // pula rows desconsiderar=true (default)
    //   data_inicio: "2026-01-01",             // janela RPC (default 2 anos atrás)
    //   data_fim: "2026-12-31",                // (default hoje + 1 mês)
    //   centro_custo: null,                    // filtra EMPRESA da SPE (null = todas)
    //   filtrar_transferencias: false,         // build-data filter (default false pra fin40)
    //   preserve_sinais: true,                 // não Math.abs (RET/refunds mantém sinal)
    //   excluir_pos_operacional: true,         // telas DRE puras filtram pos_operacional
    // },

    // Adapter Manual XLSX — lê do drive
    // manual_xlsx: {
    //   movimentos_file: "movimentos.xlsx",  // relativo ao drive.base_path
    // },

    // Path Drive (compartilhado entre adapters que precisam ler XLSX)
    drive: {
      base_path: "G:/Meu Drive/BGP/CLIENTES/BI/<NUMERO>. <NOME>/BASES",
    },
  },

  // ============================================================
  // PAGES — define quais aparecem no menu e quais têm dados reais.
  //
  // Cada page tem um "mode":
  //   "active"   → tem dados reais, funciona normalmente
  //   "upsell"   → aparece no menu com badge PRO, click mostra explicação + CTA
  //                (sem dados reais — usado pra futuros upsells)
  //   "hidden"   → não aparece no menu
  // ============================================================
  pages: {
    // Pages do core — quase sempre "active". Default = "active".
    geral: {
      overview: "active",
      receita: "active",
      despesa: "active",
      fluxo: "active",
      tesouraria: "active",
      comparativo: "active",
      relatorio_ia: "upsell",   // pode começar como upsell e virar active quando contratar
      valuation: "upsell",       // idem
    },
    // Pages opcionais — escolhe quais aparecem ("active") ou ficam como upsell ("upsell")
    outros: {
      // faturamento_produto: "active",   // ative quando tiver XLSX FaturamentoPorProduto.xlsx
      // curva_abc: "active",             // ative quando tiver CurvaABCPRodutos.xlsx
      // marketing_ads: "upsell",         // mostra como PRO até cliente contratar
      // crm_omie: "active",              // ative quando tiver consolidado XLSX
    },
  },

  // ============================================================
  // META — premissas de negócio
  // ============================================================
  meta: {
    ano_corrente: 2026,
    metas_crm: { mes: 1_000_000, ano: 12_000_000 },
    valuation_premissas: { wacc: 25, growth_year2: 20, growth_year3: 20, ipca: 4.5, perpetuity_growth: 10 },
  },

  template: {
    version_when_created: "1.0.0",
    version_last_synced: "1.0.0",
  },
};
