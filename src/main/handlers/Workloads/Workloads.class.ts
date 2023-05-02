import * as k8s from '@kubernetes/client-node'
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import os from 'os'
import path from 'path'

import Channels from '../../../constants/Channels'
import Endpoints from '../../../constants/Endpoints'
import { ClusterModel, ClusterType } from '../../../models/Cluster'
import { LogModel } from '../../../models/Log'
import { getHomePath } from '../../managers/PathManager'
import { getWorkloads } from './Workloads-helper'

const type = os.type()

class Workloads {
  static fetchWorkloads = async (window: BrowserWindow, cluster: ClusterModel) => {
    try {
      const k8DefaultClient = await Workloads._getK8DefaultClient(cluster)

      return await getWorkloads(k8DefaultClient, 'local')
    } catch (err) {
      log.error(JSON.stringify(err))
      window.webContents.send(Channels.Utilities.Log, cluster.id, {
        category: 'K8s workloads',
        message: JSON.stringify(err)
      } as LogModel)
      throw err
    }
  }

  private static _getK8DefaultClient = async (cluster: ClusterModel) => {
    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()

    if (cluster.type === ClusterType.Minikube) {
      const contextExists = kc.getContextObject('minikube')
      if (!contextExists) {
        throw 'Unable to find minikube config'
      }

      kc.setCurrentContext('minikube')
    } else if (cluster.type === ClusterType.MicroK8s) {
      if (type === 'Windows_NT') {
        const homePath = await getHomePath()
        const configPath = path.join(Endpoints.Paths.WSL_PREFIX, homePath.replace('/', '\\'), '.kube\\config-microk8s')
        kc.loadFromFile(configPath)
      }

      const contextExists = kc.getContextObject('etherealengine-microk8s')
      if (!contextExists) {
        throw 'Unable to find microK8s config'
      }

      kc.setCurrentContext('etherealengine-microk8s')
    }

    const k8DefaultClient = kc.makeApiClient(k8s.CoreV1Api)
    return k8DefaultClient
  }
}

export default Workloads
