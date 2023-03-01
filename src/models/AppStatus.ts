export type AppModel = {
  id: string
  name: string
  checkCommand: string
  detail: string | Buffer | undefined
  status: AppStatus
}

export enum AppStatus {
  Checking,
  Configured,
  NotConfigured,
  Pending
}

const minikubeDependantScript = (script: string) => {
  return `
  MINIKUBE_STATUS=$(minikube status --output json);
  if [[ $MINIKUBE_STATUS == *"minikube start"* ]] || [[ $MINIKUBE_STATUS == *"Nonexistent"* ]] || [[ $MINIKUBE_STATUS == *"Stopped"* ]]; then
    echo "Minikube not configured" >&2;
    exit 1;
  else
    ${script}
    exit 0;
  fi`
}

export const DefaultSystemStatus: AppModel[] = [
  {
    id: 'os',
    name: 'Operating System',
    checkCommand: '',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'cpu',
    name: 'CPUs',
    checkCommand: '',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'memory',
    name: 'Memory',
    checkCommand: '',
    detail: '',
    status: AppStatus.Checking
  }
]

export const DefaultAppsStatus: AppModel[] = [
  {
    id: 'node',
    name: 'Node',
    checkCommand: 'node --version;',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'npm',
    name: 'npm',
    checkCommand: 'npm --version;',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'python',
    name: 'Python',
    checkCommand: 'pip3 --version && python3 --version;',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'make',
    name: 'Make',
    checkCommand: 'make --version;',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'git',
    name: 'Git',
    checkCommand: 'git --version;',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'docker',
    name: 'Docker',
    checkCommand: 'docker --version;',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'dockercompose',
    name: 'Docker Compose',
    checkCommand: 'docker-compose --version;',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'mysql',
    name: 'MySql',
    checkCommand: 'docker top etherealengine_minikube_db;',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'virtualbox',
    name: 'VirtualBox',
    checkCommand: 'vboxmanage --version;',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'kubectl',
    name: 'kubectl',
    checkCommand: 'kubectl version --client --output=yaml;',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'helm',
    name: 'Helm',
    checkCommand: 'helm version;',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'minikube',
    name: 'Minikube',
    checkCommand: minikubeDependantScript('minikube version; minikube status;'),
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'ingress',
    name: 'Ingress',
    checkCommand: minikubeDependantScript(
      `ingress_ns="ingress-nginx"; podname=$(kubectl get pods -n $ingress_ns -l app.kubernetes.io/name=ingress-nginx --field-selector=status.phase==Running -o jsonpath='{.items[0].metadata.name}'); kubectl exec -i -n $ingress_ns $podname -- /nginx-ingress-controller --version;`
    ),
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'redis',
    name: 'Redis',
    checkCommand: minikubeDependantScript('helm status local-redis;'),
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'agones',
    name: 'Agones',
    checkCommand: minikubeDependantScript('helm status agones;'),
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'fileserver',
    name: 'Local File Server',
    checkCommand: `
    if lsof -Pi :8642 -sTCP:LISTEN -t >/dev/null ; then
      echo "File server configured:"
      lsof -Pi :8642 -sTCP:LISTEN
      exit 0;
    else
      echo "File server not configured" >&2;
      exit 1;
    fi
    `,
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'etherealengine',
    name: 'Ethereal Engine',
    checkCommand: minikubeDependantScript('helm status local;'),
    detail: '',
    status: AppStatus.Checking
  }
]

export const DefaultRippleAppsStatus: AppModel[] = [
  {
    id: 'rippled',
    name: 'Rippled',
    checkCommand: minikubeDependantScript('helm status local-rippled;'),
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'ipfs',
    name: 'IPFS',
    checkCommand: minikubeDependantScript('helm status local-ipfs;'),
    detail: '',
    status: AppStatus.Checking
  }
]

export const DefaultClusterStatus: AppModel[] = [
  {
    id: 'client',
    name: 'Client',
    checkCommand: 'kubectl get deployment local-etherealengine-client -o "jsonpath={.status.availableReplicas}"',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'api',
    name: 'API Server',
    checkCommand: 'kubectl get deployment local-etherealengine-api -o "jsonpath={.status.availableReplicas}"',
    detail: '',
    status: AppStatus.Checking
  },
  {
    id: 'instanceserver',
    name: 'Instance Server',
    checkCommand: 'kubectl get fleets local-instanceserver -o "jsonpath={.status.readyReplicas}"',
    detail: '',
    status: AppStatus.Checking
  }
]
