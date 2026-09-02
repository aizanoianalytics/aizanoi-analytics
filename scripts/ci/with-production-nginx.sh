#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <port> <command> [args...]" >&2
  exit 2
fi

port="$1"
shift
root="${GITHUB_WORKSPACE:-$(pwd)}"
config="/tmp/aizanoi-production-${port}.conf"
pid="/tmp/aizanoi-production-${port}.pid"
error_log="/tmp/aizanoi-production-${port}-error.log"
base_url="http://127.0.0.1:${port}"

cat > "$config" <<EOF
pid ${pid};
error_log ${error_log};
events {}
http {
  include /etc/nginx/mime.types;
  access_log off;
  server {
    listen 127.0.0.1:${port};
    root ${root}/frontend;
    index index.html;
    include ${root}/infra/nginx/snippets/aizanoi-static-security-headers.conf.example;

    location = / { try_files /index.html =404; }
    location ^~ /js/ { try_files \$uri =404; }
    location ^~ /styles/ { try_files \$uri =404; }
    location ^~ /assets/ { try_files \$uri =404; }

    location = /web-editor-preview { return 301 /web-editor-preview/; }
    location = /web-editor-preview/ {
      include ${root}/infra/nginx/snippets/aizanoi-web-editor-preview-headers.conf.example;
      try_files /web-editor-preview/index.html =404;
    }
    location ^~ /web-editor-preview/ {
      include ${root}/infra/nginx/snippets/aizanoi-web-editor-preview-headers.conf.example;
      try_files \$uri =404;
    }

    location ^~ /analytics/dashboards/hr-analytics-full-set/ {
      include ${root}/infra/nginx/snippets/aizanoi-hr-analytics-security-headers.conf.example;
      try_files \$uri \$uri/ =404;
    }

    location = /historic-world/ {
      include ${root}/infra/nginx/snippets/aizanoi-historical-world-security-headers.conf.example;
      try_files /historic-world/index.html =404;
    }
    location ^~ /historic-world/ {
      include ${root}/infra/nginx/snippets/aizanoi-historical-world-security-headers.conf.example;
      try_files \$uri =404;
    }
    location ^~ /ancient-cities/ {
      include ${root}/infra/nginx/snippets/aizanoi-historical-world-security-headers.conf.example;
      try_files \$uri \$uri/ =404;
    }

    location / { try_files \$uri \$uri/ =404; }
  }
}
EOF

cleanup() {
  nginx -s stop -c "$config" >/dev/null 2>&1 || true
  rm -f "$config" "$pid"
}
trap cleanup EXIT

nginx -t -c "$config"
nginx -c "$config"
for _ in {1..30}; do
  if curl -fsSI "$base_url/" >/dev/null; then
    AIZANOI_PRODUCTION_BASE_URL="$base_url" "$@"
    exit $?
  fi
  sleep 0.5
done

cat "$error_log" >&2 || true
exit 1
