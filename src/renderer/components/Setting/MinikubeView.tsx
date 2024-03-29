import Channels from 'constants/Channels'
import Commands from 'main/Clusters/Minikube/Minikube.commands'
import { cloneCluster } from 'models/Cluster'
import { ShellResponse } from 'models/ShellResponse'
import { useSnackbar } from 'notistack'
import { useState } from 'react'
import { useConfigFileState } from 'renderer/services/ConfigFileService'
import { DeploymentService } from 'renderer/services/DeploymentService'
import { SettingsService } from 'renderer/services/SettingsService'

import { LoadingButton } from '@mui/lab'
import { Box, CircularProgress, FormControlLabel, SxProps, Theme, Typography } from '@mui/material'

import InfoTooltip from '../../common/InfoTooltip'
import AlertDialog from '../../dialogs/AlertDialog'
import DockerView from './DockerView'

interface Props {
  sx?: SxProps<Theme>
}

const MinikubeView = ({ sx }: Props) => {
  const { enqueueSnackbar } = useSnackbar()
  const [showMinikubeAlert, setMinikubeAlert] = useState(false)
  const [showVirtualboxAlert, setVirtualboxAlert] = useState(false)
  const [processingMinikubePrune, setProcessingMinikubePrune] = useState(false)
  const [processingVirtualboxPrune, setProcessingVirtualboxPrune] = useState(false)

  const configFileState = useConfigFileState()
  const { selectedCluster } = configFileState.value

  if (!selectedCluster) {
    return <></>
  }

  const onPruneMinikube = async () => {
    const clonedCluster = cloneCluster(selectedCluster)

    try {
      setMinikubeAlert(false)
      setProcessingMinikubePrune(true)

      const password = await SettingsService.getDecryptedSudoPassword()

      const command = `echo '${password}' | sudo -S ${Commands.MINIKUBE_REMOVE}`
      const output: ShellResponse = await window.electronAPI.invoke(
        Channels.Shell.ExecuteCommand,
        clonedCluster,
        command
      )

      const stringError = output.stderr?.toString().trim() || ''
      if (stringError.toLowerCase().includes('error') || stringError.toLowerCase().includes('is not installed')) {
        throw stringError
      }

      setProcessingMinikubePrune(false)

      await DeploymentService.fetchDeploymentStatus(clonedCluster)
    } catch (err) {
      enqueueSnackbar('Failed to remove minikube.', { variant: 'error' })
      setProcessingMinikubePrune(false)
    }
  }

  const onPruneVirtualbox = async () => {
    const clonedCluster = cloneCluster(selectedCluster)

    try {
      setVirtualboxAlert(false)
      setProcessingVirtualboxPrune(true)

      const password = await SettingsService.getDecryptedSudoPassword()

      let command = `echo '${password}' | sudo -S ${Commands.VIRTUALBOX_REMOVE}`
      let output: ShellResponse = await window.electronAPI.invoke(Channels.Shell.ExecuteCommand, clonedCluster, command)

      let stringError = output.stderr?.toString().trim() || ''
      if (stringError.toLowerCase().includes('error')) {
        throw stringError
      }

      command = `echo '${password}' | sudo -S ${Commands.VIRTUALBOX_DKMS_REMOVE}`
      output = await window.electronAPI.invoke(Channels.Shell.ExecuteCommand, clonedCluster, command)

      stringError = output.stderr?.toString().trim() || ''
      if (stringError.toLowerCase().includes('error')) {
        throw stringError
      }

      setProcessingVirtualboxPrune(false)

      await DeploymentService.fetchDeploymentStatus(clonedCluster)
    } catch (err) {
      enqueueSnackbar('Failed to remove virtualbox.', { variant: 'error' })
      setProcessingVirtualboxPrune(false)
    }
  }

  return (
    <Box sx={sx}>
      <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline' }}>
        <FormControlLabel
          labelPlacement="start"
          label={
            <Box sx={{ display: 'flex', alignItems: 'top', flexDirection: 'row' }}>
              <Typography variant="body2">REMOVE MINIKUBE</Typography>
              <InfoTooltip message="This will remove minikube from your machine." />
            </Box>
          }
          control={<></>}
          sx={{ marginTop: 2, marginLeft: 0 }}
        />
        <LoadingButton
          variant="outlined"
          sx={{ marginLeft: 4, width: processingMinikubePrune ? 130 : 'auto' }}
          loading={processingMinikubePrune}
          loadingIndicator={
            <Box sx={{ display: 'flex', color: 'var(--textColor)' }}>
              <CircularProgress size={24} sx={{ marginRight: 1 }} />
              Pruning
            </Box>
          }
          onClick={() => setMinikubeAlert(true)}
        >
          Prune
        </LoadingButton>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline' }}>
        <FormControlLabel
          labelPlacement="start"
          label={
            <Box sx={{ display: 'flex', alignItems: 'top', flexDirection: 'row' }}>
              <Typography variant="body2">REMOVE VIRTUALBOX</Typography>
              <InfoTooltip message="This will remove virtualbox from your machine." />
            </Box>
          }
          control={<></>}
          sx={{ marginTop: 2, marginLeft: 0 }}
        />
        <LoadingButton
          variant="outlined"
          sx={{ marginLeft: 4, width: processingVirtualboxPrune ? 130 : 'auto' }}
          loading={processingVirtualboxPrune}
          loadingIndicator={
            <Box sx={{ display: 'flex', color: 'var(--textColor)' }}>
              <CircularProgress size={24} sx={{ marginRight: 1 }} />
              Pruning
            </Box>
          }
          onClick={() => setVirtualboxAlert(true)}
        >
          Prune
        </LoadingButton>
      </Box>

      <DockerView sx={{ width: '100%', mt: 2 }} />

      {showMinikubeAlert && (
        <AlertDialog
          title="Confirmation"
          message="Are you sure you want to proceed? This will remove minikube from your machine."
          okButtonText="Proceed"
          onClose={() => setMinikubeAlert(false)}
          onOk={onPruneMinikube}
        />
      )}

      {showVirtualboxAlert && (
        <AlertDialog
          title="Confirmation"
          message="Are you sure you want to proceed? This will remove virtualbox from your machine."
          okButtonText="Proceed"
          onClose={() => setVirtualboxAlert(false)}
          onOk={onPruneVirtualbox}
        />
      )}
    </Box>
  )
}

export default MinikubeView
