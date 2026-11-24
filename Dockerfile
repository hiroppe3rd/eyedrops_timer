# Apache ベースの本番用イメージ
FROM httpd:2.4-alpine

# Web App Manifest の MIME タイプとキャッシュ制御（新旧ファイル不整合防止）を追加
RUN sed -i 's/#LoadModule headers_module/LoadModule headers_module/' /usr/local/apache2/conf/httpd.conf \
  && printf '\nAddType application/manifest+json .webmanifest\n<FilesMatch "\\.(html|js|css|webmanifest)$">\n  Header set Cache-Control "no-cache"\n</FilesMatch>\n' >> /usr/local/apache2/conf/httpd.conf

# 公開ファイルをドキュメントルートへ配置
COPY public/ /usr/local/apache2/htdocs/

EXPOSE 80

# コンテナ死活監視
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

# 起動時に環境変数から env.js を生成して Apache を起動
CMD ["/bin/sh", "-c", "printf '// .env から自動生成される環境設定（手動編集不要）\\nwindow.__EYEDROPS_ENV__ = {\\n  \"GOOGLE_CLIENT_ID\": \"%s\"\\n};\\n' \"${GOOGLE_CLIENT_ID:-}\" > /usr/local/apache2/htdocs/js/env.js && exec httpd-foreground"]
