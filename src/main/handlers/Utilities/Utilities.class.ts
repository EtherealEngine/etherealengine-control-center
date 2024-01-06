import { app, BrowserWindow, clipboard, dialog, shell } from 'electron'
import log from 'electron-log'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

import Channels from '../../../constants/Channels'
import { AppModel, AppStatus } from '../../../models/AppStatus'
import { AppSysInfo, OSType } from '../../../models/AppSysInfo'
import { LogModel } from '../../../models/Log'
import { ensureWSLToWindowsPath, getHomePath, getWSLPrefixPath } from '../../managers/PathManager'
import { cleanseString, exec } from '../../managers/ShellManager'
import { WindowsPrerequisites } from './Prerequisites'

class Utilities {
  static copyClipboard = (copyText: string) => {
    clipboard.writeText(copyText)
    log.info('Copied to clipboard: ', copyText)
  }

  static getAppSysInfo = () => {
    const appVersion = app.getVersion()
    const type = os.type()

    let osType = OSType.Undefined
    if (type === 'Linux') {
      osType = OSType.Linux
    } else if (type === 'Darwin') {
      osType = OSType.Mac
    } else if (type === 'Windows_NT') {
      osType = OSType.Windows
    }

    return { appVersion, osType } as AppSysInfo
  }

  static openExternal = async (url: string) => {
    await shell.openExternal(url)
    log.info('Opening external: ', url)
  }

  static openPath = (pathToOpen: string) => {
    shell.showItemInFolder(pathToOpen)
    log.info('Opening path: ', pathToOpen)
  }

  static selectFolder = async () => {
    let defaultPath: string | undefined = undefined

    if (os.type() === 'Windows_NT') {
      const homePath = await getHomePath()
      defaultPath = await ensureWSLToWindowsPath(homePath)
    }

    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath
    })

    if (filePaths.length > 0) {
      return filePaths[0]
    }

    return ''
  }

  static selectFile = async () => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openFile']
    })

    if (filePaths.length > 0) {
      return filePaths[0]
    }

    return ''
  }

  static saveLog = async (clusterId: string, contents: string[], fileName: string, window: BrowserWindow) => {
    try {
      const logPath = path.join(app.getPath('downloads'), fileName)
      const content = contents.join(os.EOL)

      await fs.writeFile(logPath, content)
      log.info('Logs saved at: ', logPath)

      return logPath
    } catch (err) {
      log.error('Failed to save logs.', err)
      window.webContents.send(Channels.Utilities.Log, clusterId, {
        category: 'save logs',
        message: JSON.stringify(err)
      } as LogModel)

      throw err
    }
  }

  static getPrerequisites = () => {
    try {
      const type = os.type()
      if (type === 'Windows_NT') {
        return WindowsPrerequisites
      }
    } catch (err) {
      log.error('Failed to get prerequisites.', err)
    }

    return []
  }

  static checkPrerequisite = async (prerequisite: AppModel) => {
    try {
      let status = AppStatus.NotConfigured

      const { stdout, stderr, error } = await exec(prerequisite.checkCommand, prerequisite.isLinuxCommand)
      const stdOutput = cleanseString(stdout?.toString() || '')

      log.info(`Check command response: ${stdOutput}`)

      if (error || stderr) {
        log.error(
          `Error while executing the check ${prerequisite.name} command: ${prerequisite.checkCommand}.`,
          error,
          stderr
        )
      }

      if (
        (prerequisite.id === 'wsl' && stdOutput) ||
        (prerequisite.id === 'wslUbuntu' && stdOutput.includes(': Ubuntu')) ||
        (prerequisite.id === 'wslUbuntuStore' && stdOutput) ||
        ((prerequisite.id === 'dockerDesktop' || prerequisite.id === 'dockerDesktopUbuntu') &&
          stdOutput.includes('Server: Docker Desktop')) ||
        (prerequisite.id === 'hostname' && !stdOutput.match(/[A-Z_]/))
      ) {
        status = AppStatus.Configured
      }

      return {
        ...prerequisite,
        detail: stderr ? stderr : stdOutput,
        status
      } as AppModel
    } catch (err) {
      log.error('Failed to check prerequisite.', err)

      return {
        ...prerequisite,
        detail: err,
        status: AppStatus.NotConfigured
      } as AppModel
    }
  }

  static getWSLPrefixPath = async () => {
    try {
      return await getWSLPrefixPath()
    } catch (err) {
      log.error('Failed to get wsl prefix path.', err)

      throw err
    }
  }
}

export default Utilities
