# Apache ベースの本番用イメージ
FROM httpd:2.4-alpine

# 公開ファイルをドキュメントルートへ配置
COPY public/ /usr/local/apache2/htdocs/

EXPOSE 80
