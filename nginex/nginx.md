# scraper.habeeb.qzz.io

map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name scraper.habeeb.qzz.io;

    ssl_certificate /etc/letsencrypt/live/scraper.habeeb.qzz.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/scraper.habeeb.qzz.io/privkey.pem;

    # 🔥 Max compatibility
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;

    ssl_ciphers HIGH:MEDIUM:!aNULL:!MD5:!3DES;
    ssl_prefer_server_ciphers on;

    ssl_ecdh_curve X25519:secp256r1:secp384r1;

    ssl_session_cache shared:SSL:20m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;

    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location ^~ /novnc/ {
        proxy_pass http://127.0.0.1:6080/;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name scraper.habeeb.qzz.io;
    return 301 https://$host$request_uri;
}