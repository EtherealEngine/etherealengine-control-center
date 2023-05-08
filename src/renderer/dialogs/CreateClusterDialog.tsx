import { decryptPassword } from 'common/UtilitiesManager'
import Channels from 'constants/Channels'
import Endpoints from 'constants/Endpoints'
import Storage, { generateUUID } from 'constants/Storage'
import { OSType } from 'models/AppSysInfo'
import { ClusterModel, ClusterType } from 'models/Cluster'
import { useEffect, useRef, useState } from 'react'
import { ConfigFileService, useConfigFileState } from 'renderer/services/ConfigFileService'
import { DeploymentService } from 'renderer/services/DeploymentService'
import { SettingsService, useSettingsState } from 'renderer/services/SettingsService'

import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import AppsIcon from '@mui/icons-material/Apps'
import DisplaySettingsIcon from '@mui/icons-material/DisplaySettings'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import TuneIcon from '@mui/icons-material/Tune'
import ViewListIcon from '@mui/icons-material/ViewList'
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
import ClusterView from '../components/Config/ClusterView'
import ConfigsView from '../components/Config/ConfigsView'
import FlagsView from '../components/Config/FlagsView'
import KubeconfigView from '../components/Config/KubeconfigView'
import PrereqsView from '../components/Config/PrereqsView'
import SummaryView from '../components/Config/SummaryView'
import VarsView from '../components/Config/VarsView'

const ColorlibStepIcon = (props: StepIconProps) => {
  const { active, completed, className } = props

  const icons: { [index: string]: React.ReactElement } = {
    cluster: <ViewListIcon />,
    kubeconfig: <TuneIcon />,
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

const CreateClusterDialog = ({ onClose }: Props) => {
  const contentStartRef = useRef(null)
  const settingsState = useSettingsState()
  const { appSysInfo, sudoPassword } = settingsState.value

  const configFileState = useConfigFileState()
  const { clusters, loading } = configFileState.value

  const [activeStepId, setActiveStepId] = useState('cluster')
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState(() => {
    const decrypted = decryptPassword(sudoPassword)
    return decrypted
  })
  const [name, setName] = useState('')
  const [type, setType] = useState<ClusterType>(ClusterType.MicroK8s)
  const [defaultConfigs, setDefaultConfigs] = useState<Record<string, string>>({})
  const [defaultVars, setDefaultVars] = useState<Record<string, string>>({})
  const [tempConfigs, setTempConfigs] = useState({} as Record<string, string>)
  const [tempVars, setTempVars] = useState({} as Record<string, string>)
  const [localFlags, setLocalFlags] = useState({ [Storage.FORCE_DB_REFRESH]: 'false' } as Record<string, string>)

  const localConfigs = {} as Record<string, string>
  for (const key in defaultConfigs) {
    localConfigs[key] = key in tempConfigs ? tempConfigs[key] : defaultConfigs[key]
  }

  const localVars = {} as Record<string, string>
  for (const key in defaultVars) {
    localVars[key] = key in tempVars ? tempVars[key] : defaultVars[key]
  }

  const loadDefaultConfigs = async () => {
    setLoading(true)
    const configs = await ConfigFileService.getDefaultConfigs()
    setDefaultConfigs(configs)
    setLoading(false)
  }

  const loadDefaultVariables = async (clusterType: ClusterType) => {
    setLoading(true)
    const vars = await ConfigFileService.getDefaultVariables(clusterType, localConfigs)
    setDefaultVars(vars)
    setLoading(false)
  }

  const handleNext = async (isConfigure: boolean) => {
    if (appSysInfo.osType === OSType.Windows && type === ClusterType.Minikube) {
      setError('On Windows, Minikube is not supported')
      return
    }

    if (!name || name.length < 3) {
      setError('Please select a cluster name of minimum 3 words')
      return
    }

    if (activeStepId === 'cluster') {
      const clusterCount = clusters.filter((item) => item.type === type)
      if (clusterCount.length > 0) {
        setError(`You already have a cluster of ${type}.`)
        return
      }
    } else if (activeStepId === 'authenticate') {
      setLoading(true)
      const sudoLoggedIn = await window.electronAPI.invoke(Channels.Shell.CheckSudoPassword, password)
      setLoading(false)

      if (sudoLoggedIn) {
        SettingsService.setSudoPassword(password)
      } else {
        setError('Invalid password')
        return
      }

      await loadDefaultConfigs()
    } else if (activeStepId === 'configs') {
      loadDefaultVariables(type)
    } else if (activeStepId === 'summary') {
      const createCluster: ClusterModel = {
        id: generateUUID(),
        name,
        type,
        configs: { ...localConfigs },
        variables: { ...localVars }
      }

      DeploymentService.setConfiguring(createCluster.id, true)

      onClose()

      const inserted = await ConfigFileService.insertOrUpdateConfig(createCluster)
      if (!inserted) {
        return
      }

      ConfigFileService.setSelectedClusterId(createCluster.id)

      await DeploymentService.fetchDeploymentStatus(createCluster)

      if (isConfigure) {
        DeploymentService.processConfigurations(createCluster, password, localFlags)
      }

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
      id: 'cluster',
      label: 'Cluster',
      title: 'Provide cluster information',
      content: (
        <Box sx={{ marginLeft: 2, marginRight: 2 }}>
          <ClusterView
            name={name}
            type={type}
            onNameChange={(name) => {
              setName(name)
              setError('')
            }}
            onTypeChange={(type) => {
              setType(type)
              setError('')
            }}
          />
          {type === ClusterType.MicroK8s && appSysInfo.osType === OSType.Windows && <PrereqsView />}
        </Box>
      )
    },
    {
      id: 'authenticate',
      label: 'Authenticate',
      title: 'Provide sudo admin password to authenticate',
      content: (
        <AuthView
          password={password}
          sx={{ marginLeft: 2, marginRight: 2 }}
          onChange={onChangePassword}
          onEnter={() => handleNext(false)}
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
        </Box>
      )
    },
    {
      id: 'variables',
      label: 'Variables',
      title: 'Provide configuration variables (Optional)',
      content: <VarsView localVars={localVars} sx={{ marginLeft: 2, marginRight: 2 }} onChange={onChangeVar} />
    },
    {
      id: 'summary',
      label: 'Summary',
      title: 'Review configurations before finalizing',
      content: (
        <SummaryView
          name={name}
          type={type}
          localConfigs={localConfigs}
          localVars={localVars}
          localFlags={localFlags}
          sx={{ marginLeft: 2, marginRight: 2 }}
        />
      )
    }
  ]

  if (type === ClusterType.Custom) {
    steps.splice(1, 0, {
      id: 'kubeconfig',
      label: 'Kubeconfig',
      title: 'Provide kubeconfig information',
      content: (
        <KubeconfigView localConfigs={localConfigs} onChange={onChangeConfig} sx={{ marginLeft: 2, marginRight: 2 }} />
      )
    })
  }

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
                type === ClusterType.Minikube
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
          {activeStep === steps.length - 1 && <Button onClick={() => handleNext(true)}>Create & Configure</Button>}
          <Button onClick={() => handleNext(false)}>{activeStep === steps.length - 1 ? 'Create' : 'Next'}</Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}

export default CreateClusterDialog
