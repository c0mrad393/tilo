#!/usr/bin/env bash
# Run once on the VPS, after the first `npm run server:deploy`, to add what the stack itself
# doesn't: the backup tools and nightly timer, fail2ban for SSH, and a firewall without 80
# and 443 (the Cloudflare tunnel reaches Caddy from inside, so the web needs no open port).
# Safe to run again. Usage, on the server: sudo bash ~/tilo/server/ops/install.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run it with sudo." >&2; exit 1; }
OPS=$(cd "$(dirname "$0")" && pwd)

apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -yq age rclone fail2ban python3-systemd

# Debian 13 logs to the journal, not /var/log/auth.log
cat >/etc/fail2ban/jail.d/tilo.local <<'JAIL'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
JAIL
systemctl enable --now fail2ban
systemctl restart fail2ban

install -d -m 755 /etc/tilo
if [ ! -f /etc/tilo/backup.env ]; then
  install -m 600 -o tilo -g tilo "$OPS/backup.env.example" /etc/tilo/backup.env
  echo "Made /etc/tilo/backup.env: fill it in (sudo -u tilo nano /etc/tilo/backup.env)."
fi
chmod +x "$OPS/backup.sh" "$OPS/restore.sh"
install -m 644 "$OPS/tilo-backup.service" "$OPS/tilo-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tilo-backup.timer

for rule in 80/tcp 443/tcp 443/udp 80 443; do ufw --force delete allow "$rule" >/dev/null 2>&1 || true; done
ufw status verbose | sed -n '1,20p'
systemctl list-timers tilo-backup.timer --no-pager
