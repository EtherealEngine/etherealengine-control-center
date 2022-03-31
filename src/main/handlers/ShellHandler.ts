import childProcess, { ExecException } from 'child_process'
import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
// import log from 'electron-log'
import path from 'path'
import sudo from 'sudo-prompt'

import { Channels } from '../../constants/Channels'
import { AppModel, AppStatus, DefaultApps } from '../../models/AppStatus'
import { IBaseHandler } from './IBaseHandler'

class ShellHandler implements IBaseHandler {
  configure = (window: BrowserWindow) => {
    ipcMain.handle(Channels.Shell.CheckMinikubeConfig, async (_event: IpcMainInvokeEvent, sudoMode: boolean) => {
      try {
        for (const app of DefaultApps) {
          let status: AppModel = {
            ...app
          }

          if (app.checkCommand) {
            const response = await exec(app.checkCommand, sudoMode)
            const { stdout, stderr } = response

            if (stdout) {
              window.webContents.send(
                Channels.Utilities.Logs,
                `${app.name} - ` + (typeof stdout === 'string' ? stdout.trim() : stdout)
              )
            }
            if (stderr) {
              window.webContents.send(
                Channels.Utilities.Logs,
                `${app.name} - ` + (typeof stderr === 'string' ? stderr.trim() : stderr)
              )
            }

            status = {
              ...app,
              detail: stderr ? stderr : stdout,
              status: stderr ? AppStatus.NotConfigured : AppStatus.Configured
            }
          }

          window.webContents.send(Channels.Shell.CheckMinikubeConfigResult, status)
        }
      } catch (err) {
        window.webContents.send(Channels.Utilities.Logs, err)
        return DefaultApps
      }
    }),
      ipcMain.handle(Channels.Shell.ConfigureMinikubeConfig, async (_event: IpcMainInvokeEvent) => {
        try {
          const script = path.join(__dirname, '../../../assets', 'scripts', 'configure-minikube.sh')

          const onStdout = (data: any) => {
            window.webContents.send(Channels.Utilities.Logs, data)
          }
          const onStderr = (data: any) => {
            window.webContents.send(Channels.Utilities.Logs, data)
          }
          const response = await shellExecStream(`sh ${script}`, onStdout, onStderr)
          window.webContents.send(Channels.Utilities.Logs, response)

          return true
        } catch (err) {
          window.webContents.send(Channels.Utilities.Logs, err)
          return false
        }
      })
  }
}

const sudoShellExec = (command: string): Promise<ShellResponse> => {
  return new Promise((resolve) => {
    sudo.exec(
      command,
      {
        name: 'XREngine Control Center'
      },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    )
  })
}

const shellExec = (command: string): Promise<ShellResponse> => {
  return new Promise((resolve) => {
    childProcess.exec(command, { shell: '/bin/bash' }, (error, stdout, stderr) => resolve({ error, stdout, stderr }))
  })
}

const shellExecStream = (
  command: string,
  onStdout: (data: any) => void,
  onStderr: (data: any) => void
): Promise<number | null> => {
  return new Promise((resolve) => {
    const process = childProcess.exec(command)
    process.stdout?.on('data', (data) => {
      onStdout(data)
    })
    process.stderr?.on('data', (data) => {
      onStderr(data)
    })
    process.on('close', (code) => {
      resolve(code)
    })
  })
}

const exec = async (command: string, isSudo = false): Promise<ShellResponse> => {
  if (isSudo) {
    return await sudoShellExec(command)
  }

  return await shellExec(command)
}

type ShellResponse = {
  error: ExecException | Error | null | undefined
  stdout: string | Buffer | undefined
  stderr: string | Buffer | undefined
}

export default ShellHandler