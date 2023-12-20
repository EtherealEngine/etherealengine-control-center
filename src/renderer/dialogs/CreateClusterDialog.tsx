import { decryptPassword } from 'common/UtilitiesManager'
import Channels from 'constants/Channels'
import Endpoints from 'constants/Endpoints'
import Storage, { generateUUID } from 'constants/Storage'
import UIEnabled from 'constants/UIEnabled'
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
import StorageIcon from '@mui/icons-material/Storage'
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
import DeploymentView from '../components/Config/DeploymentView'
import FlagsView from '../components/Config/FlagsView'
import KubeconfigView from '../components/Config/KubeconfigView'
import PrereqsView from '../components/Config/PrereqsView'
import SummaryView from '../components/Config/SummaryView'
import VarsView from '../components/Config/VarsView'
import RunDevView from 'renderer/components/Config/RunDevView'

const ColorlibStepIcon = (props: StepIconProps) => {
  const { active, completed, className } = props

  const icons: { [index: string]: React.ReactElement } = {
    cluster: <ViewListIcon />,
    kubeconfig: <TuneIcon />,
    deployment: <StorageIcon />,
    authenticate: <AdminPanelSettingsIcon />,
    configs: <DisplaySettingsIcon />,
    variables: <PlaylistAddCheckIcon />,
    summary: <AppsIcon />
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

const defaultState = {
  activeStepId: 'cluster',
  name: '',
  type: ClusterType.MicroK8s,
  defaultConfigs: {} as Record<string, string>,
  defaultVars: {} as Record<string, string>,
  tempConfigs: {} as Record<string, string>,
  tempVars: {} as Record<string, string>,
  localFlags: {} as Record<string, string>,
  isLoading: false,
  error: ''
}

const CreateClusterDialog = ({ onClose }: Props) => {
  const contentStartRef = useRef(null)
  const settingsState = useSettingsState()
  const { appSysInfo, sudoPassword } = settingsState.value

  const configFileState = useConfigFileState()
  const { loading } = configFileState.value

  const [password, setPassword] = useState(() => {
    const decrypted = decryptPassword(sudoPassword)
    return decrypted
  })

  const [
    { activeStepId, name, type, defaultConfigs, defaultVars, tempConfigs, tempVars, localFlags, isLoading, error },
    setState
  ] = useState(defaultState)

  const localConfigs = {} as Record<string, string>
  for (const key in { ...defaultConfigs, ...tempConfigs }) {
    localConfigs[key] = key in tempConfigs ? tempConfigs[key] : defaultConfigs[key]
  }

  const localVars = {} as Record<string, string>
  for (const key in defaultVars) {
    localVars[key] = key in tempVars ? tempVars[key] : defaultVars[key]
  }

  const loadDefaultConfigs = async () => {
    setState((state) => ({ ...state, isLoading: true }))
    const configs = await ConfigFileService.getDefaultConfigs(type)
    setState((state) => ({
      ...state,
      defaultConfigs: configs,
      localFlags: { [Storage.FORCE_DB_REFRESH]: 'false', [Storage.RUN_IN_DEVELOPMENT]: 'false' },
      isLoading: false
    }))
  }

  const loadDefaultVariables = async () => {
    setState((state) => ({ ...state, isLoading: true }))
    const vars = await ConfigFileService.getDefaultVariables(type, localConfigs)
    setState((state) => ({ ...state, defaultVars: vars, isLoading: false }))
  }

  const handleNext = async (isConfigure: boolean) => {
    if (appSysInfo.osType === OSType.Windows && type === ClusterType.Minikube) {
      setState((state) => ({ ...state, error: 'On Windows, Minikube is not supported' }))
      return
    }

    if (!name || name.length < 3) {
      setState((state) => ({ ...state, error: 'Please select a cluster name of minimum 3 words' }))
      return
    }

    if (activeStepId === 'authenticate') {
      setState((state) => ({ ...state, isLoading: true }))
      const sudoLoggedIn = await window.electronAPI.invoke(Channels.Shell.CheckSudoPassword, password)
      setState((state) => ({ ...state, isLoading: false }))

      if (sudoLoggedIn) {
        SettingsService.setSudoPassword(password)
      } else {
        setState((state) => ({ ...state, error: 'Invalid password' }))
        return
      }

      await loadDefaultConfigs()
    } else if (activeStepId === 'configs') {
      await loadDefaultVariables()
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

      if (createCluster.type === ClusterType.Custom) {
        return
      }

      await DeploymentService.fetchDeploymentStatus(createCluster)

      if (isConfigure) {
        DeploymentService.processConfigurations(createCluster, password, localFlags)
      }

      return
    }

    setState((state) => ({ ...state, activeStepId: steps[activeStep + 1].id, error: '' }))
  }

  const handleBack = () => {
    setState((state) => ({ ...state, activeStepId: steps[activeStep - 1].id, error: '' }))
  }

  const onTypeChange = (type: ClusterType) => {
    setState({ ...defaultState, name, type })
  }

  const onChangeFlag = async (key: string, value: string) => {
    const newFlags = { ...localFlags }
    newFlags[key] = value
    setState((state) => ({ ...state, localFlags: newFlags, error: '' }))
  }

  const onChangeConfig = async (key: string, value: string) => {
    const newConfigs = { ...tempConfigs }
    newConfigs[key] = value
    setState((state) => ({ ...state, tempConfigs: newConfigs, error: '' }))
  }

  const onChangeConfigs = async (records: Record<string, string>) => {
    setState((state) => {
      const newConfigs = { ...state.tempConfigs, ...records }

      for (const key in records) {
        if (records[key] === '') {
          delete newConfigs[key]
        }
      }
      return { ...state, tempConfigs: newConfigs, error: '' }
    })
  }

  const onChangeVar = async (key: string, value: string) => {
    const newVars = { ...tempVars }
    newVars[key] = value
    setState((state) => ({ ...state, tempVars: newVars, error: '' }))
  }

  const onChangePassword = (password: string) => {
    setPassword(password)
    setState((state) => ({ ...state, error: '' }))
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
            onNameChange={(name) => setState((state) => ({ ...state, name, error: '' }))}
            onTypeChange={onTypeChange}
          />
          {type === ClusterType.MicroK8s && appSysInfo.osType === OSType.Windows && <PrereqsView />}
        </Box>
      )
    }
  ]

  if (UIEnabled[type].createCluster.authenticate) {
    steps.push({
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
    })
  }

  if (UIEnabled[type].createCluster.configs) {
    steps.push({
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
    })
  }

  if (UIEnabled[type].createCluster.variables) {
    steps.push({
      id: 'variables',
      label: 'Variables',
      title: 'Provide configuration variables (Optional)',
      content: <VarsView localVars={localVars} sx={{ marginLeft: 2, marginRight: 2 }} onChange={onChangeVar} />
    })
  }

  if (UIEnabled[type].createCluster.kubeconfig) {
    steps.push({
      id: 'kubeconfig',
      label: 'Kubeconfig',
      title: 'Provide kubeconfig information',
      content: (
        <KubeconfigView localConfigs={localConfigs} onChange={onChangeConfigs} sx={{ marginLeft: 2, marginRight: 2 }} />
      )
    })
  }

  if (UIEnabled[type].createCluster.deployment) {
    steps.push({
      id: 'deployment',
      label: 'Deployment',
      title: 'Provide deployment information',
      content: (
        <DeploymentView localConfigs={localConfigs} onChange={onChangeConfig} sx={{ marginLeft: 2, marginRight: 2 }} />
      )
    })
  }

  steps.push({
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
  })

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

      {activeStepId === 'summary' && UIEnabled[type].createCluster.showSummaryNotes && (
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
          {activeStep === steps.length - 1 && UIEnabled[type].createCluster.showConfigButton && (
            <Button onClick={() => handleNext(true)}>Create & Configure</Button>
          )}
          <Button
            disabled={
              (activeStepId === 'kubeconfig' && !localConfigs[Storage.KUBECONFIG_CONTEXT]) ||
              (activeStepId === 'deployment' && !localConfigs[Storage.RELEASE_NAME])
            }
            onClick={() => handleNext(false)}
          >
            {activeStep === steps.length - 1 ? 'Create' : 'Next'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}

export default CreateClusterDialog
