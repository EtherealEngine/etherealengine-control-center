const Commands = {
  IPFS_SECRET: "od  -vN 32 -An -tx1 /dev/urandom | tr -d ' \n'",
  DOCKER_STATS: "docker system df --format='{{json .}}';",
  DOCKER_PRUNE: 'docker system prune -a -f;',
  DEPLOYMENT_PRUNE: 'helm uninstall agones local-redis local;',
  MOK_SETUP: 'gnome-terminal --wait -- bash -c "sudo dpkg --configure -a; exit 0; exec bash"',
  MOK_RESTART: `sudo systemctl reboot`,
  STATUS_CHECK_BATCH_LIMIT: 2
}

export default Commands
