/**
 * Adapter: Conta Azul (skeleton — IMPLEMENTAR)
 *
 * Documentação API: https://developers.contaazul.com/
 * OAuth 2.0 — exige refresh_token persistido em .env.
 *
 * TODO: implementar quando primeiro cliente Conta Azul vier.
 *
 * Configuração mínima esperada em bi.config.js:
 *   fontes: {
 *     adapters: ["conta-azul"],
 *     conta_azul: {
 *       client_id_env: "CA_CLIENT_ID",
 *       client_secret_env: "CA_CLIENT_SECRET",
 *       refresh_token_env: "CA_REFRESH_TOKEN",
 *     }
 *   }
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  id: 'conta-azul',
  label: 'Conta Azul',
  required_env: ['CA_CLIENT_ID', 'CA_CLIENT_SECRET', 'CA_REFRESH_TOKEN'],

  validate(config) {
    const errors = [];
    for (const v of this.required_env) {
      if (!process.env[v]) errors.push(`env ${v} não definido`);
    }
    if (!config.fontes || !config.fontes['conta_azul']) {
      errors.push('config.fontes.conta_azul não definido');
    }
    return { ok: errors.length === 0, errors };
  },

  async pull(config, dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });

    // TODO: trocar refresh_token por access_token (OAuth)
    // const accessToken = await refreshToken(...)

    // TODO: pull endpoints
    //   GET /v1/financial/movements?type=RECEIVABLE&page=...
    //   GET /v1/financial/movements?type=PAYABLE&page=...
    //   GET /v1/financial-categories
    //   GET /v1/customers
    //   GET /v1/financial-accounts

    // TODO: normalizar pra schema canonical (ver adapters/_CONTRACT.md)

    const movimentos = [];   // canonical
    fs.writeFileSync(path.join(dataDir, 'movimentos.json'), JSON.stringify(movimentos));

    throw new Error('Adapter conta-azul ainda não implementado. Veja TODOs em adapters/conta-azul.cjs');
  },
};
