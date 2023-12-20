import { BrowserWindow } from 'electron'
import log from 'electron-log'
import findProcess from 'find-process'
import os from 'os'
import path from 'path'
import { kill } from 'ps-node'

import { delay } from '../../../common/UtilitiesManager'
import Channels from '../../../constants/Channels'
import Endpoints from '../../../constants/Endpoints'
import Storage from '../../../constants/Storage'
import { DeploymentAppModel } from '../../../models/AppStatus'
import { ClusterModel } from '../../../models/Cluster'
import { LogModel } from '../../../models/Log'
import Utilities from '../../handlers/Utilities/Utilities.class'
import { executeWebViewJS } from '../../managers/BrowserManager'
import { assetsPath, ensureConfigsFolder, ensureWindowsToWSLPath, scriptsPath } from '../../managers/PathManager'
import { execStream, execStreamScriptFile } from '../../managers/ShellManager'
import { ensureConfigs } from '../../managers/YamlManager'
import { DefaultEngineStatus, DefaultSystemStatus } from '../BaseCluster/BaseCluster.appstatus'
import BaseCluster from '../BaseCluster/BaseCluster.class'
import { MicroK8sAppsStatus, MicroK8sRippleAppsStatus } from './MicroK8s.appstatus'
import Commands from './MicroK8s.commands'
import Requirements from './MicroK8s.requirements'

class MicroK8s {
  static getClusterStatus = async (cluster: ClusterModel, sudoPassword?: string) => {
    const prerequisites = Utilities.getPrerequisites()

    const systemStatus = [...DefaultSystemStatus, ...prerequisites]
    const engineStatus = [...DefaultEngineStatus]
    let appStatus = [...MicroK8sAppsStatus(sudoPassword)]

    const enableRipple = cluster.configs[Storage.ENABLE_RIPPLE_STACK]

    if (enableRipple && enableRipple === 'true') {
      appStatus = [...MicroK8sAppsStatus(sudoPassword), ...MicroK8sRippleAppsStatus(sudoPassword)]
    }

    return { systemStatus, engineStatus, appStatus } as DeploymentAppModel
  }

  static checkClusterStatus = async (
    window: BrowserWindow,
    cluster: ClusterModel,
    deploymentApps: DeploymentAppModel
  ) => {
    await BaseCluster.checkClusterStatus(window, cluster, deploymentApps, Requirements)
  }

  static configureK8Dashboard = async (window: BrowserWindow, cluster: ClusterModel) => {
    const category = 'K8s dashboard'

    const onStderr = (data: any) => {
      const stringData = typeof data === 'string' ? data.trim() : data

      let overrideError = ''
      if (stringData.includes('unable to listen')) {
        overrideError =
          'It seems like your port 10443 is already in use. To view the PID using this port run: `lsof -i :10443`\nAfterwards run this command to kill the task: `kill -9 {PID}`'
      }
      window.webContents.send(Channels.Utilities.Log, cluster.id, {
        category,
        message: `${stringData}${overrideError ? `\n\n${overrideError}` : ''}`
      } as LogModel)
      window.webContents.send(
        Channels.Cluster.ConfigureK8DashboardError,
        cluster.id,
        overrideError ? overrideError : data
      )
    }

    const onStdout = async (data: any) => {
      const stringData = typeof data === 'string' ? data.trim() : data
      window.webContents.send(Channels.Utilities.Log, cluster.id, { category, message: stringData } as LogModel)

      if (data.includes('Forwarding from 127.0.0.1:10443')) {
        const dashboardUrl = 'https://localhost:10443/'

        window.webContents.send(Channels.Cluster.ConfigureK8DashboardResponse, cluster.id, dashboardUrl)

        await delay(1000)
        await executeWebViewJS(`document.querySelector('button[type=\\"button\\"]').click()`, window)
      }
    }

    try {
      const type = os.type()

      // Ensure port is not in use
      const processes = await findProcess('port', 10443)
      for (const process of processes) {
        kill(process.pid)
      }

      // Start dashboard port-forward
      let command = Commands.DASHBOARD
      if (type === 'Windows_NT') {
        command = command.replaceAll('$', '`$')
        command = `wsl bash -ic "/snap/bin/${command}"`
      }
      await execStream(command, onStdout, onStderr)
    } catch (err) {
      onStderr(JSON.stringify(err))
      throw err
    }
  }

  static configureCluster = async (
    window: BrowserWindow,
    cluster: ClusterModel,
    password: string,
    flags: Record<string, string>
  ) => {
    const category = 'configure microk8s'
    try {
      const type = os.type()

      await BaseCluster.ensureVariables(cluster)

      let configsFolder = await ensureConfigsFolder()
      configsFolder = await ensureWindowsToWSLPath(configsFolder)

      await ensureConfigs(cluster, Endpoints.Paths.MICROK8S_VALUES_TEMPLATE, Endpoints.Urls.MICROK8S_VALUES_TEMPLATE)

      const scriptsFolder = scriptsPath()
      let assetsFolder = assetsPath()
      assetsFolder = await ensureWindowsToWSLPath(assetsFolder)

      let configFile = 'configure-microk8s-linux.sh'
      if (type === 'Windows_NT') {
        configFile = 'configure-microk8s-windows.ps1'
      }

      const configureScript = path.join(scriptsFolder, configFile)
      log.info(`Executing script ${configureScript}`)

      const onConfigureStd = (data: any) => {
        window.webContents.send(Channels.Utilities.Log, cluster.id, { category, message: data } as LogModel)
      }
      const code = await execStreamScriptFile(
        configureScript,
        [
          `-a "${assetsFolder}"`,
          `-c "${configsFolder}"`,
          `-d "${flags[Storage.FORCE_DB_REFRESH]}"`,
          `-f "${cluster.configs[Storage.ENGINE_PATH]}"`,
          `-i "${cluster.id}"`,
          `-o "${cluster.configs[Storage.OPS_PATH]}"`,
          `-p "${password}"`,
          `-r "${cluster.configs[Storage.ENABLE_RIPPLE_STACK]}"`,
          `-u "${flags[Storage.RUN_IN_DEVELOPMENT]}"`
        ],
        onConfigureStd,
        onConfigureStd
      )
      if (code !== 0) {
        throw `Failed with error code ${code}.`
      }
    } catch (err) {
      log.error('Error in configureCluster MicroK8s.', err)
      window.webContents.send(Channels.Utilities.Log, cluster.id, {
        category,
        message: JSON.stringify(err)
      } as LogModel)
      throw err
    }
  }
}

export default MicroK8s
