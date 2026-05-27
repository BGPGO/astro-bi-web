# Coolify deploy — serve estática BI via nginx (mais previsível que Caddy
# no setup do Coolify; veja issue de "exited:unhealthy" com caddy:2-alpine).
#
# Arquivos obrigatórios (sempre gerados por build-data.cjs + build-jsx.cjs):
#   index.html, styles.css, data.js, app.bundle.js, nginx.conf
#
# Arquivos opcionais que cliente PODE não ter — placeholder gerado pelo
# bgp-bi.cjs init (vazio) pra COPY não falhar:
#   data-extras.js, saldos.json, assets/
#
# Reports IA pré-gerados (report*.json) NÃO são copiados aqui — são gerados
# on-the-fly via backend ai-proxy. Cliente que cacheia local: adicionar COPYs.

FROM nginx:alpine

# Obrigatórios
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY app.bundle.js /usr/share/nginx/html/

# Astro: dados pre-calculados pelos scripts/build_*_data.py
COPY astro-data.js /usr/share/nginx/html/
COPY filipe-data.js /usr/share/nginx/html/
COPY giro-data.js /usr/share/nginx/html/
COPY frete-data.js /usr/share/nginx/html/
COPY pedmin-data.js /usr/share/nginx/html/
COPY recompra-data.js /usr/share/nginx/html/
COPY campanhas-data.js /usr/share/nginx/html/
COPY agressividade-data.js /usr/share/nginx/html/
COPY abc-data.js /usr/share/nginx/html/
COPY tendcomp-data.js /usr/share/nginx/html/
COPY tendtemp-data.js /usr/share/nginx/html/
COPY tendprod-data.js /usr/share/nginx/html/
COPY tendmarcas-data.js /usr/share/nginx/html/
COPY cohort-data.js /usr/share/nginx/html/
COPY compvendatotal-data.js /usr/share/nginx/html/
COPY analisevendas-data.js /usr/share/nginx/html/
COPY campest-data.js /usr/share/nginx/html/
COPY vendasdiautil-data.js /usr/share/nginx/html/
COPY cfv-data.js /usr/share/nginx/html/
COPY geral-data.js /usr/share/nginx/html/
COPY data /usr/share/nginx/html/data
COPY assets /usr/share/nginx/html/assets

# Config nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
