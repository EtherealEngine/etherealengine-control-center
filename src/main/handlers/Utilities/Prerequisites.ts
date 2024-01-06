import { AppModel, getAppModel } from '../../../models/AppStatus'

export const WindowsPrerequisites: AppModel[] = [
  getAppModel('wsl', 'Windows Subsystem for Linux (WSL)', 'wsl --status;', false),
  getAppModel('wslUbuntu', 'WSL Ubuntu Distribution', 'wsl --status;', false),
  getAppModel('wslUbuntuStore', 'Ubuntu from Windows Store', 'Get-service wslservice;', false),
  getAppModel('dockerDesktop', 'Docker Desktop', 'docker version;', false),
  getAppModel('dockerDesktopUbuntu', 'Docker Desktop WSL Ubuntu Integration', 'wsl docker version;', false),
  getAppModel('hostname', 'Hostname Compliance', 'hostname;', false)
]
