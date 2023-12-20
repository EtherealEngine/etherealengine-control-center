import { decryptPassword } from 'common/UtilitiesManager'
import Channels from 'constants/Channels'
import Endpoints from 'constants/Endpoints'
import Storage from 'constants/Storage'
import { OSType } from 'models/AppSysInfo'
import { ClusterModel, ClusterType } from 'models/Cluster'
import { useSnackbar } from 'notistack'
import { useEffect, useRef, useState } from 'react'
import { ConfigFileService, useConfigFileState } from 'renderer/services/ConfigFileService'
import { DeploymentService } from 'renderer/services/DeploymentService'
import { SettingsService, useSettingsState } from 'renderer/services/SettingsService'

import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import AppsIcon from '@mui/icons-material/Apps'
import DisplaySettingsIcon from '@mui/icons-material/DisplaySettings'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Step,
  StepLabel,
  Stepper,
  Typography
} from '@mui/material'
import { StepIconProps } from '@mui/material/StepIcon'

import { ColorlibConnector, ColorlibStepIconRoot } from '../components/Colorlib'
import AuthView from '../components/Config/AuthView'
import ConfigsView from '../components/Config/ConfigsView'
import FlagsView from '../components/Config/FlagsView'
import SummaryView from '../components/Config/SummaryView'
import VarsView from '../components/Config/VarsView'
import RunDevView from 'renderer/components/Config/RunDevView'

const ColorlibStepIcon = (props: StepIconProps) => {
  const { active, completed, className } = props

  const icons: { [index: string]: React.ReactElement } = {
    authenticate: <AdminPanelSettingsIcon />,
    configs: <DisplaySettingsIcon />,
    summary: <AppsIcon />,
    variables: <PlaylistAddCheckIcon />
  }

  return (
    <ColorlibStepIconRoot ownerState={{ completed, active }} className={className}>
      {icons[String(props.id)]}
    </ColorlibStepIconRoot>
  )
}

interface Props {
  onClose: () => void
}

const ConfigurationDialog = ({ onClose }: Props) => {
  const contentStartRef = useRef(null)
  const { enqueueSnackbar } = useSnackbar()
  const settingsState = useSettingsState()
  const { appSysInfo, sudoPassword } = settingsState.value

  const configFileState = useConfigFileState()
  const { loading, selectedCluster } = configFileState.value

  const [activeStepId, setActiveStepId] = useState('authenticate')
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState(() => {
    const decrypted = decryptPassword(sudoPassword)
    return decrypted
  })
  const [tempConfigs, setTempConfigs] = useState({} as Record<string, string>)
  const [tempVars, setTempVars] = useState({} as Record<string, string>)
  const [localFlags, setLocalFlags] = useState({ [Storage.FORCE_DB_REFRESH]: 'false', [Storage.RUN_IN_DEVELOPMENT]: 'false' } as Record<string, string>)

  if (!selectedCluster) {
    enqueueSnackbar('Please select a cluster.', { variant: 'error' })
    onClose()
    return <></>
  }

  const localConfigs = {} as Record<string, string>
  for (const key in selectedCluster.configs) {
    localConfigs[key] = key in tempConfigs ? tempConfigs[key] : selectedCluster.configs[key]
  }

  const localVars = {} as Record<string, string>
  for (const key in selectedCluster.variables) {
    localVars[key] = key in tempVars ? tempVars[key] : selectedCluster.variables[key]
  }

  const handleNext = async () => {
    if (activeStepId === 'authenticate') {
      setLoading(true)
      const sudoLoggedIn = await window.electronAPI.invoke(Channels.Shell.CheckSudoPassword, password)
      setLoading(false)
      if (sudoLoggedIn) {
        SettingsService.setSudoPassword(password)
      } else {
        setError('Invalid password')
        return
      }
    } else if (activeStepId === 'summary') {
      const updatedCluster: ClusterModel = {
        ...selectedCluster,
        configs: { ...localConfigs },
        variables: { ...localVars }
      }

      DeploymentService.setConfiguring(updatedCluster.id, true)

      onClose()

      if (Object.keys(tempConfigs).length > 0 || Object.keys(tempVars).length > 0) {
        const saved = await ConfigFileService.insertOrUpdateConfig(updatedCluster)
        if (!saved) {
          return
        }

        await DeploymentService.fetchDeploymentStatus(updatedCluster)
      }

      DeploymentService.processConfigurations(updatedCluster, password, localFlags)

      return
    }

    setActiveStepId(steps[activeStep + 1].id)
    setError('')
  }

  const handleBack = () => {
    setActiveStepId(steps[activeStep - 1].id)
    setError('')
  }

  const onChangeFlag = async (key: string, value: string) => {
    const newFlags = { ...localFlags }
    newFlags[key] = value
    setLocalFlags(newFlags)
    setError('')
  }

  const onChangeConfig = async (key: string, value: string) => {
    const newConfigs = { ...tempConfigs }
    newConfigs[key] = value
    setTempConfigs(newConfigs)
    setError('')
  }

  const onChangeVar = async (key: string, value: string) => {
    const newVars = { ...tempVars }
    newVars[key] = value
    setTempVars(newVars)
    setError('')
  }

  const onChangePassword = (password: string) => {
    setPassword(password)
    setError('')
  }

  const steps = [
    {
      id: 'authenticate',
      label: 'Authenticate',
      title: 'Provide sudo admin password to authenticate',
      content: (
        <AuthView
          password={password}
          sx={{ marginLeft: 2, marginRight: 2 }}
          onChange={onChangePassword}
          onEnter={handleNext}
        />
      )
    },
    {
      id: 'configs',
      label: 'Configs',
      title: 'Provide configuration details',
      content: (
        <Box sx={{ marginLeft: 2, marginRight: 2 }}>
          <ConfigsView localConfigs={localConfigs} onChange={onChangeConfig} />
          <FlagsView localFlags={localFlags} onChange={onChangeFlag} />
          <RunDevView localFlags={localFlags} onChange={onChangeFlag}/>
        </Box>
      )
    },
    {
      id: 'variables',
      label: 'Variables',
      title: (
        <>
          Provide configuration variables (Optional).
          <br />
          <span style={{ fontSize: 14, opacity: 0.6 }}>
            If value is not provided, then the default ones from <b>.env.local</b> of Ethereal Engine repo will be used.
          </span>
        </>
      ),
      content: <VarsView localVars={localVars} sx={{ marginLeft: 2, marginRight: 2 }} onChange={onChangeVar} />
    },
    {
      id: 'summary',
      label: 'Summary',
      title: 'Review configurations before finalizing',
      content: (
        <SummaryView
          localConfigs={localConfigs}
          localVars={localVars}
          localFlags={localFlags}
          sx={{ marginLeft: 2, marginRight: 2 }}
        />
      )
    }
  ]

  const activeStep = steps.findIndex((item) => item.id === activeStepId)

  useEffect(() => (contentStartRef.current as any)?.scrollTo(0, 0), [activeStep])

  return (
    <Dialog open fullWidth maxWidth="sm">
      {(isLoading || loading) && <LinearProgress />}
      <DialogTitle>
        <Stepper alternativeLabel activeStep={activeStep} connector={<ColorlibConnector />}>
          {steps.map((step) => (
            <Step key={step.label}>
              <StepLabel StepIconComponent={(prop) => <ColorlibStepIcon id={step.id} {...prop} />}>
                {step.label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </DialogTitle>

      <DialogContentText sx={{ margin: 3, marginBottom: 0 }}>{steps[activeStep].title}</DialogContentText>

      {activeStepId === 'authenticate' && appSysInfo.osType === OSType.Windows && (
        <Box ml={3} mr={3} mt={1}>
          <Typography fontSize={14}>
            Note:{' '}
            <span style={{ fontSize: 14, opacity: 0.6 }}>
              On Windows, this is the password of your WSL Ubuntu distribution
            </span>
          </Typography>
        </Box>
      )}

      {activeStepId === 'summary' && (
        <Box ml={3} mr={3} mt={1}>
          <Typography fontSize={14}>
            Note:{' '}
            <span style={{ fontSize: 14, opacity: 0.6 }}>
              Control Center will install missing packages and make changes in your system configurations. To review
              these changes you can checkout the script{' '}
            </span>
            <a
              style={{ color: 'var(--textColor)' }}
              target="_blank"
              href={
                selectedCluster?.type === ClusterType.Minikube
                  ? Endpoints.Urls.MINIKUBE_LINUX_SCRIPT
                  : appSysInfo.osType === OSType.Windows
                  ? Endpoints.Urls.MICROK8S_WINDOWS_SCRIPT
                  : Endpoints.Urls.MICROK8S_LINUX_SCRIPT
              }
            >
              here
            </a>
            .
          </Typography>
          <Typography mt={1} fontSize={14}>
            Note:{' '}
            <span style={{ fontSize: 14, opacity: 0.6 }}>
              The configuration may fail the 1st time you are trying to run it. You can try, running the configuration
              wizard again, or relaunching the control center app, or reboot your PC. This is because some changes
              require you to perform these actions. If you still face the same issue then report it.
            </span>
          </Typography>
        </Box>
      )}

      {error && (
        <DialogContentText sx={{ marginLeft: 5, marginRight: 5, color: 'red' }}>Error: {error}</DialogContentText>
      )}

      <DialogContent ref={contentStartRef} sx={{ height: '27vh', marginBottom: 3 }}>
        {steps[activeStep].content}
      </DialogContent>
      <DialogActions>
        <Box sx={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
          <Button onClick={() => onClose()}>Cancel</Button>

          <Box sx={{ flex: '1 1 auto' }} />

          <Button disabled={activeStep === 0} onClick={handleBack} sx={{ mr: 1 }}>
            Back
          </Button>
          <Button onClick={handleNext}>{activeStep === steps.length - 1 ? 'Configure' : 'Next'}</Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}

export default ConfigurationDialog
