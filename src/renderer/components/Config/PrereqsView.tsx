import Endpoints from 'constants/Endpoints'
import Commands from 'main/Clusters/BaseCluster/BaseCluster.commands'
import { AppModel, AppStatus } from 'models/AppStatus'
import { OSType } from 'models/AppSysInfo'
import { useEffect, useState } from 'react'
import { accessSettingsState, SettingsService } from 'renderer/services/SettingsService'

import { Box, SxProps, Theme, Typography } from '@mui/material'

import { StatusViewItem } from '../StatusView'

interface Props {
  sx?: SxProps<Theme>
}

const PrereqsView = ({ sx }: Props) => {
  const [statuses, setStatuses] = useState<AppModel[]>([])

  useEffect(() => {
    loadPrerequisites()
  }, [])

  const loadPrerequisites = async () => {
    // load and display prerequisites with loading status
    const initialStatuses = await SettingsService.getPrerequisites()
    setStatuses(initialStatuses)

    const checkedStatuses = [...initialStatuses]
    const appSysInfo = accessSettingsState().value.appSysInfo
    const batchSize = appSysInfo.osType === OSType.Windows ? Commands.STATUS_CHECK_BATCH_LIMIT : initialStatuses.length

    for (let batch = 0; batch < initialStatuses.length; batch = batch + batchSize) {
      const currentBatch = initialStatuses.slice(batch, batch + batchSize)
      await Promise.all(
        currentBatch.map(async (status) => {
          // Display prerequisite with checked status
          const checkedStatus = await SettingsService.checkPrerequisite(status)

          // Add description for corrective actions to be displayed in dialog
          if (checkedStatus.status !== AppStatus.Configured) {
            processDescriptions(checkedStatus)
          }

          const currentIndex = initialStatuses.findIndex((item) => item.id === status.id)
          checkedStatuses[currentIndex] = checkedStatus

          setStatuses((prevState) => {
            const newState = [...prevState]
            newState[currentIndex] = checkedStatus
            return newState
          })
        })
      )
    }
  }

  const processDescriptions = (status: AppModel) => {
    if (status.id === 'wsl' || status.id === 'wslUbuntu' || status.id === 'wslUbuntuStore') {
      status.description = (
        <Typography fontSize={14}>
          <span style={{ fontSize: 14, opacity: 0.6 }}>
            Make sure WSL is installed and Ubuntu is selected as default distribution.{' '}
          </span>
          <a style={{ color: 'var(--textColor)' }} target="_blank" href={Endpoints.Docs.INSTALL_WSL}>
            Install WSL
          </a>
          .
          {status.id === 'wslUbuntu' && (
            <>
              <br />
              <br />
              <span style={{ fontSize: 14, opacity: 0.6 }}>
                To ensure 'Ubuntu' is set as default WSL distribution. You can check your default distribution by
                running following command in Powershell/CMD:
              </span>
              <br />
              <code>wsl -l</code>
              <br />
              <br />
              <span style={{ fontSize: 14, opacity: 0.6 }}>
                Afterwards, if Ubuntu is not selected as default, then you can do so by running following command:
              </span>
              <br />
              <code>wsl -s Ubuntu</code>
            </>
          )}{' '}
          {status.id === 'wslUbuntuStore' && (
            <>
              <br />
              <br />
              <span style={{ fontSize: 14, opacity: 0.6 }}>
                To install the Ubuntu distribution from the Windows Store, you can refer to docs above
              </span>
            </>
          )}
        </Typography>
      )
    } else if (status.id === 'dockerDesktop' || status.id === 'dockerDesktopUbuntu') {
      status.description = (
        <Typography fontSize={14}>
          <span style={{ fontSize: 14, opacity: 0.6 }}>
            Make sure Docker Desktop is installed and Ubuntu WSL Integration is enabled.{' '}
          </span>
          <a style={{ color: 'var(--textColor)' }} target="_blank" href={Endpoints.Docs.INSTALL_DOCKER}>
            Install Docker Desktop
          </a>
          .
        </Typography>
      )
    } else if (status.id === 'hostname') {
      status.description = (
        <Typography fontSize={14}>
          <span style={{ fontSize: 14, opacity: 0.6 }}>
            If the hostname contains uppercase letters and/or underscore, you should change it to meet the requirements.
          </span>
          <br />
          <br />
          <span style={{ fontSize: 14, opacity: 0.6 }}>
            You can check the hostname by running the following command in PowerShell:
            <br />
            <br />
            <code>hostname</code>
          </span>
          <br />
          <br />
          <span style={{ fontSize: 14, opacity: 0.6 }}>
            To rename Hostname you can use following command in PowerShell (With admin rights):
            <br />
            <br />
            <code>Rename-Computer -NewName "newname"</code>
          </span>
        </Typography>
      )
    }
  }

  return (
    <Box sx={sx}>
      <Typography mt={2} mb={1}>
        Prerequisites:
      </Typography>

      {statuses.map((status) => (
        <StatusViewItem key={status.id} titleVariant="body2" titleSx={{ mt: 0.5 }} verticalAlignTop status={status} />
      ))}
    </Box>
  )
}

export default PrereqsView
