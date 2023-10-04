import os from 'os'

import { AppModel, getAppModel } from '../../../models/AppStatus'

const type = os.type()

const microk8sDependantScript = (script: string, microk8sPrefix: string) => {
  script = `
      if [[ ! -f '/snap/bin/microk8s' ]]; then
        echo 'MicroK8s is not installed' >&2;
        ${type !== 'Windows_NT' ? 'exit 1;' : ''}
      elif ${microk8sPrefix}microk8s status 2>/dev/null | grep -q 'microk8s is not running'; then
        echo 'MicroK8s not configured' >&2;
        ${type !== 'Windows_NT' ? 'exit 1;' : ''}
      else
        ${script}
        ${type !== 'Windows_NT' ? 'exit 0;' : ''}
      fi
    `

  return script
}
export const MicroK8sAppsStatus = (sudoPassword?: string): AppModel[] => {
  let microk8sPrefix = ''

  if (type === 'Windows_NT') {
    microk8sPrefix = '/snap/bin/'
  }

  if (sudoPassword) {
    if (type === 'Darwin') {
      microk8sPrefix = `echo '${sudoPassword}'`
    } else {
      microk8sPrefix = `echo '${sudoPassword}' | sudo -S ${microk8sPrefix}`
    }
  }

  const appStatus = [
    getAppModel('node', 'Node', 'node --version;'),
    getAppModel('npm', 'npm', 'npm --version;'),
    getAppModel('python', 'Python', 'pip3 --version; python3 --version;'),
    getAppModel('make', 'Make', 'make --version;'),
    getAppModel('docker', 'Docker', 'docker --version;'),
    getAppModel('dockercompose', 'Docker Compose', 'docker-compose --version;'),
    getAppModel('mysql', 'MySql', 'docker top etherealengine_minikube_db;'),
    getAppModel('minio', 'MinIO', 'docker top etherealengine_minio_s3;'),
    getAppModel('kubectl', 'kubectl', 'kubectl version --client --output=yaml;'),
    getAppModel('helm', 'Helm', 'helm version;'),
    getAppModel(
      'microk8s',
      'MicroK8s',
      microk8sDependantScript(`${microk8sPrefix}microk8s version;${microk8sPrefix}microk8s status;`, microk8sPrefix)
    ),
    getAppModel(
      'ingress',
      'Ingress',
      microk8sDependantScript(
        `kubectl exec -i -n ingress ${
          type === 'Windows_NT' ? '\\' : ''
        }$(kubectl get pods -n ingress -l name=nginx-ingress-microk8s --field-selector=status.phase==Running -o jsonpath='{.items[0].metadata.name}') -- /nginx-ingress-controller --version;`,
        microk8sPrefix
      )
    ),
    getAppModel('redis', 'Redis', microk8sDependantScript(`helm status local-redis;`, microk8sPrefix)),
    getAppModel('agones', 'Agones', microk8sDependantScript(`helm status agones;`, microk8sPrefix)),
    getAppModel(
      'hostfile',
      'Hostfile',
      type === 'Windows_NT'
        ? `
        $content = Get-Content "$env:SystemRoot\\System32\\drivers\\etc\\hosts" -Raw
        $wslIp = wsl hostname -I
  
        if ($wslIp -like "* *") {
          $wslIp = $wslIp.split(" ")[0]
  
          if ($content -like "*local.etherealengine.org*") {
            if ($content -like "*$wslIp*") {
                Write-Host "*.etherealengine.org entries exists"
            } else {
                throw "*.etherealengine.org entries outdated"
            }
          } else {
            throw "*.etherealengine.org entries does not exist"
          }
  
          if ($content -like "*microk8s.registry*") {
            if ($content -like "*$wslIp*") {
                Write-Host "microk8s.registry entries exists"
            } else {
                throw "microk8s.registry entries outdated"
            }
          } else {
            throw "microk8s.registry entries does not exist"
          }
        } else {
          throw "Kindly make sure WSL is installed and Ubuntu distro is set as default."
        }
        `
        : microk8sDependantScript(
            type === 'Darwin'
              ? `
              if grep 'local.etherealengine.org' /etc/hosts; then
                  if grep '127.0.0.1 local.etherealengine.org' /etc/hosts; then
                      echo '*.etherealengine.org entries exists'
                      exit 0;
                  else
                    echo '*.etherealengine.org entries outdated';
                    exit 1;
                  fi
              else
                echo '*.etherealengine.org entries does not exist';
                exit 1;
              fi
            `
              : `
        if grep -q 'local.etherealengine.org' /etc/hosts; then
            if grep -q '127.0.0.1 local.etherealengine.org' /etc/hosts; then
                echo '*.etherealengine.org entries exists'
                exit 0;
            else
              echo '*.etherealengine.org entries outdated' >&2;
              exit 1;
            fi
        else
          echo '*.etherealengine.org entries does not exist' >&2;
          exit 1;
        fi
      `,
            microk8sPrefix
          ),
      type !== 'Windows_NT'
    ),
    getAppModel('engine', 'Ethereal Engine', microk8sDependantScript(`helm status local;`, microk8sPrefix))
  ]

  if (type === 'Windows_NT') {
    appStatus.splice(
      4,
      0,
      getAppModel('gitWindows', 'Git for Windows', 'git --version;', false),
      getAppModel('gitWsl', 'Git in WSL', 'git --version;')
    )
  } else {
    appStatus.splice(4, 0, getAppModel('git', 'Git', 'git --version;'))
  }

  return appStatus
}

export const MicroK8sRippleAppsStatus = (sudoPassword?: string): AppModel[] => {
  let microk8sPrefix = ''

  if (type === 'Windows_NT') {
    microk8sPrefix = '/snap/bin/'
  }

  if (sudoPassword) {
    microk8sPrefix = `echo '${sudoPassword}' | sudo -S ${microk8sPrefix}`
  }

  return [
    getAppModel(
      'rippled',
      'Rippled',
      microk8sDependantScript('helm status local-rippled;', microk8sPrefix),
      true,
      undefined,
      undefined,
      undefined,
      true
    ),
    getAppModel(
      'ipfs',
      'IPFS',
      microk8sDependantScript('helm status local-ipfs;', microk8sPrefix),
      true,
      undefined,
      undefined,
      undefined,
      true
    )
  ]
}
