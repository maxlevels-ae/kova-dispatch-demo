# Move Maxride to the new server

1. DNS: point an A record (e.g. ride.maxlevels.net) at the server IP.
2. Server (as root): `ufw allow 22,80,443/tcp && ufw enable`; create a non-root sudo user and use SSH keys.
3. `git clone https://github.com/maxlevels-ae/kova-dispatch-demo.git /opt/maxride && cd /opt/maxride`
4. `cp deploy/.env.production.example .env.production` and fill it in (copy values from the Render dashboard).
5. `docker compose -f deploy/docker-compose.prod.yml --env-file .env.production up -d --build`
6. Data: dump the current DB (`mongodump --uri "<current MONGODB_URI>" --archive=maxride.gz --gzip`), copy it over,
   then `docker compose -f deploy/docker-compose.prod.yml exec -T mongodb mongorestore --archive --gzip --drop < maxride.gz`
7. Check `https://<domain>/api/health`. When happy, switch the real domain's DNS and retire Render.
8. Backups: nightly `mongodump` via cron, copied off the server.
