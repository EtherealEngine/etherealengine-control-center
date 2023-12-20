
#==========
# Variables
#==========

$wslRestart = $false;
$dockerRestart = $false;

#==========
# Functions
#==========

function checkExitCode() { 
    if ($LastExitCode -ne 0) {
        exit $LastExitCode;
    }
}

function cleanseString($inputSt) { 
    $finalString = ''
    $inputString = $inputSt -join "`n" | Out-String
    
    for ($index = 0; $index -lt $inputString.Length; $index++) {
        $codePoints = [int][char]$inputString[$index]
        if ($codePoints -ne 0) {
            $finalString += $inputString[$index]
        }
    }

    return $finalString
}

#===========
# Parameters
#===========
# Ref: https://www.red-gate.com/simple-talk/sysadmin/powershell/how-to-use-parameters-in-powershell/

for ( $i = 0; $i -lt $args.count; $i += 2 ) {
    if ($args[$i] -eq "-a") {
        $ASSETS_FOLDER = $args[$i + 1]
        $SCRIPTS_FOLDER = "$ASSETS_FOLDER/scripts"
    }
    elseif ($args[$i] -eq "-c") {
        $CONFIGS_FOLDER = $args[$i + 1]
    }
    elseif ($args[$i] -eq "-d") {
        $FORCE_DB_REFRESH = $args[$i + 1]
    }
    elseif ($args[$i] -eq "-f") {
        $ENGINE_FOLDER = $args[$i + 1]
    }
    elseif ($args[$i] -eq "-i") {
        $CLUSTER_ID = $args[$i + 1]
    }
    elseif ($args[$i] -eq "-o") {
        $OPS_FOLDER = $args[$i + 1]
    }
    elseif ($args[$i] -eq "-p") {
        $PASSWORD = $args[$i + 1]
    }
    elseif ($args[$i] -eq "-r") {
        $ENABLE_RIPPLE_STACK = $args[$i + 1]
    }
    elseif ($args[$i] -eq "-u") {
        $RUN_IN_DEVELOPMENT = $args[$i + 1]
    }
    else {
        throw "Invalid argument passed"
        exit 1
    }
}

if ([string]::IsNullOrEmpty($ASSETS_FOLDER) -or 
    [string]::IsNullOrEmpty($CONFIGS_FOLDER) -or 
    [string]::IsNullOrEmpty($FORCE_DB_REFRESH) -or 
    [string]::IsNullOrEmpty($ENGINE_FOLDER) -or 
    [string]::IsNullOrEmpty($CLUSTER_ID) -or 
    [string]::IsNullOrEmpty($OPS_FOLDER) -or 
    [string]::IsNullOrEmpty($PASSWORD) -or 
    [string]::IsNullOrEmpty($ENABLE_RIPPLE_STACK) -or
    [string]::IsNullOrEmpty($RUN_IN_DEVELOPMENT)) {
    throw "Missing arguments"
    exit 1
}

Write-Host "Starting Ethereal Engine configuration for MicroK8s in WSL";

Write-Host "Cluster ID: $CLUSTER_ID";
Write-Host "Force DB Refresh: $FORCE_DB_REFRESH";
Write-Host "Enable Ripple Stack: $ENABLE_RIPPLE_STACK";
Write-Host "Engine Folder: $ENGINE_FOLDER";
Write-Host "OPS Folder: $OPS_FOLDER";
Write-Host "Configs Folder: $CONFIGS_FOLDER";
Write-Host "Assets Folder: $ASSETS_FOLDER";
Write-Host "Force DB Refresh: $RUN_IN_DEVELOPMENT";

#==============
# Prerequisites
#==============

$wslStatus = cleanseString(wsl --status);
Write-Host "WSL Status: `n$wslStatus";

if ([string]::IsNullOrEmpty($wslStatus) -or $wslStatus -notlike '*: Ubuntu*') {
    throw "Make sure WSL is installed and Ubuntu is selected as default distribution.`nhttps://etherealengine.github.io/etherealengine-docs/docs/host/devops_deployment/microk8s_windows/#install-windows-subsystem-for-linux-wsl";
    exit 1;
}

$dockerVersion = cleanseString(docker version);
Write-Host "Docker Version: `n$dockerVersion";
$wslDockerVersion = cleanseString(wsl docker version);
Write-Host "WSL Docker version: `n$wslDockerVersion";

if ($dockerVersion -notlike '*Server: Docker Desktop*' -or $wslDockerVersion -notlike '*Server: Docker Desktop*') {
    throw "Make sure Docker Desktop is installed and Ubuntu WSL Integration is enabled.`nhttps://etherealengine.github.io/etherealengine-docs/docs/host/devops_deployment/microk8s_windows/#install-docker-desktop";
    exit 1;
}

# Reference: If you have WSL from the Windows Store then WslService service should be there. 
# Else it would be LxssManager. https://github.com/microsoft/WSL/issues/8644#issuecomment-1194772945
$wslWindowsService = Get-Service WslService
if ($wslWindowsService) {
    Write-Host "You have WSL from the Windows Store.";
}
else {
    throw "You do not have WSL from the Windows Store.";
    exit 1;
}

#=======================
# Verify Git for Windows
#=======================

& "$PSScriptRoot\check-git-windows.ps1";

#==========
# WSL Login
#==========

wsl bash -ic "`"$SCRIPTS_FOLDER/check-login.sh`" `"$PASSWORD`"";

checkExitCode;

#======================
# Enable systemd in WSL
#======================

wsl bash -ic "`"$SCRIPTS_FOLDER/check-wsl-systemd.sh`" `"$PASSWORD`"";

if ($LastExitCode -eq 1) {
    $wslRestart = $true;
}

#==================================
# Enable localhostForwarding in WSL
#==================================

& "$PSScriptRoot\check-wsl-localhostForwarding.ps1";

if ($LastExitCode -eq 1) {
    $wslRestart = $true;
}

#================================
# Docker MicroK8s Registry access
#================================

& "$PSScriptRoot\check-microk8s-docker-daemon.ps1"

if ($LastExitCode -eq 1) {
    $dockerRestart = $true;
}

#=====================
# WSL & Docker Restart
#=====================

if ($wslRestart) {
    Write-Host "Restarting WSL";

    wsl -t Ubuntu;
    wsl -d Ubuntu echo "Starting WSL";
}

if ($wslRestart -or $dockerRestart) {
    Write-Host "Restarting Docker Desktop";

    # Reference: https://stackoverflow.com/a/52628883/2077741
    # $processes = Get-Process "*Docker Desktop*"

    # if ($processes.Count -gt 0) {
    #     $processes[0].Kill()
    #     $processes[0].WaitForExit()
    # }

    #Reference: https://forums.docker.com/t/shutting-down-docker-desktop-on-windows-10-programmatically/107395
    TASKKILL.exe /f /IM "Docker Desktop.exe" /T

    Start-Sleep -Seconds 10;
    
    $dockerPaths = $env:path -split ";" -match "docker"
    $dockerPath = $dockerPaths[0] -replace "\\resources\\bin", ""

    if ([string]::IsNullOrEmpty($dockerPath)) {
        $dockerPath = "$env:PROGRAMFILES\Docker\Docker"
    }

    Write-Host "Docker Path is $dockerPath"

    Start-Process "$dockerPath\Docker Desktop.exe"

    Start-Sleep -Seconds 10;

    # Ensure docker is up and running again
    do {
        Start-Sleep -Seconds 5;

        $wslDockerVersion = cleanseString(wsl docker version);
        Write-Host "Checking Docker Restart Status";
    } while ($wslDockerVersion -notlike '*Server: Docker Desktop*')
}

#================
# Verify hostfile
#================

& "$PSScriptRoot\check-hostfile.ps1" "readonly"

if ($LastExitCode -eq 1) {
    $hostfileProcess = Start-Process powershell -PassThru -Wait -verb runas -ArgumentList "-file $PSScriptRoot\check-hostfile.ps1"

    if ($hostfileProcess.ExitCode -eq 0) {
        Write-Host "Hostfile already up to date";
    }
    elseif ($hostfileProcess.ExitCode -eq 1) {
        Write-Host "Hostfile updated";
    }
    else {
        Write-Host "Hostfile update exited with:";
        Write-Host $hostfileProcess.ExitCode;
        Write-host "Failed in check-hostfile"
        exit $hostfileProcess.ExitCode;
    }
}

#============
# Verify Node
#============

wsl bash -ic "`"$SCRIPTS_FOLDER/check-node.sh`" `"$PASSWORD`"";

checkExitCode;

#=============
# Verify Npm
#=============

wsl bash -ic "`"$SCRIPTS_FOLDER/check-npm.sh`"";

checkExitCode;

#================
# Verify Python 3
#================

wsl bash -ic "`"$SCRIPTS_FOLDER/check-python.sh`" `"$PASSWORD`"";

checkExitCode;

#=============
# Verify Make
#=============

wsl bash -ic "`"$SCRIPTS_FOLDER/check-make.sh`" `"$PASSWORD`"";

checkExitCode;

#==============
# Verify Docker
#==============

$dockerVersion = wsl bash -ic "docker --version";

if ($dockerVersion) {    
    Write-Host "docker is installed";
}
else {
    Write-Host "docker is not installed";
    exit 1;
}

Write-Host "docker version is $dockerVersion";

#======================
# Verify Docker Compose
#======================

$dockerComposeVersion = wsl bash -ic "docker-compose --version";

if ($dockerComposeVersion) {    
    Write-Host "docker-compose is installed";
}
else {
    Write-Host "docker-compose is not installed";
    exit 1;
}

Write-Host "docker-compose version is $dockerComposeVersion";

#===============
# Verify Kubectl
#===============

wsl bash -ic "`"$SCRIPTS_FOLDER/check-kubectl.sh`" `"$PASSWORD`"";

checkExitCode;

#============
# Verify Helm
#============

wsl bash -ic "`"$SCRIPTS_FOLDER/check-helm.sh`" `"$PASSWORD`"";

checkExitCode;

#================
# Verify MicroK8s
#================

wsl bash -ic "`"$SCRIPTS_FOLDER/check-microk8s.sh`" `"$PASSWORD`" `"$ASSETS_FOLDER`"";

checkExitCode;

#=============
# Get Engine
#=============

wsl bash -ic "`"$SCRIPTS_FOLDER/check-engine-repo.sh`" `"$ENGINE_FOLDER`" `"$OPS_FOLDER`"";

checkExitCode;

#=========================
# Ensure directory is safe
#=========================

Write-Host "Checking if repositories are marked as safe directories"

$distro = cleanseString(wsl bash -ic 'echo $WSL_DISTRO_NAME');
$distro = $distro.ToString().Trim();
$isEngineSafe = $true
$isOpsSafe = $true

$engineStatusCommand = 'git -C "\\wsl.localhost\$distro$ENGINE_FOLDER" status';
$opsStatusCommand = 'git -C "\\wsl.localhost\$distro$OPS_FOLDER" status';

$engineOutput = Invoke-Expression "& $engineStatusCommand 2>&1";
$opsOutput = Invoke-Expression "& $opsStatusCommand 2>&1";

if ([String]$engineOutput -match "dubious ownership") {
    $isEngineSafe = $false
}

if ([String]$opsOutput -match "dubious ownership") {
    $isOpsSafe = $false
}

if (($isEngineSafe -eq $false) -or ($isOpsSafe -eq $false)) {
    Write-Host "Marking repositories as safe directories"
    Start-Process powershell -PassThru -Wait -verb runas -ArgumentList "-file $PSScriptRoot\set-git-safe-directory.ps1 -e '$ENGINE_FOLDER' -o '$OPS_FOLDER' -d '$distro' -es $isEngineSafe -os $isOpsSafe"
}

Write-Host "Repositories are marked as safe directories"

#============================
# Ensure DB and Redis Running
#============================

wsl bash -ic "`"$SCRIPTS_FOLDER/check-mysql.sh`" `"$PASSWORD`" `"$ENGINE_FOLDER`"";

checkExitCode;

#==================
# Verify Helm Repos
#==================

wsl bash -ic "`"$SCRIPTS_FOLDER/check-helm-repos.sh`"";

checkExitCode;

#======================
# Verify agones & redis
#======================

wsl bash -ic "`"$SCRIPTS_FOLDER/check-agones-redis.sh`" `"$OPS_FOLDER`"";

checkExitCode;

#====================
# Verify ripple stack
#====================

wsl bash -ic "`"$SCRIPTS_FOLDER/check-ripple.sh`" `"$ENABLE_RIPPLE_STACK`" `"$OPS_FOLDER`" `"$CONFIGS_FOLDER`" `"$CLUSTER_ID`"";

checkExitCode;

#=====================
# Get Docker Image Tag
#=====================

wsl bash -ic "echo '$PASSWORD' | sudo -S apt install jq -y";

$TAG = wsl bash -ic "echo `$(jq -r .version `"$ENGINE_FOLDER/packages/server-core/package.json`")_`$(cd `"$ENGINE_FOLDER`" && git rev-parse HEAD)__`$(date +`"%d-%m-%yT%H-%M-%S`")";

Write-Host "Tag is $TAG";

#=======================
# Verify Ethereal Engine
#=======================

wsl bash -ic "`"$SCRIPTS_FOLDER/check-engine-deployment.sh`" `"$ENGINE_FOLDER`" `"$FORCE_DB_REFRESH`" `"$CONFIGS_FOLDER`" `"$CLUSTER_ID`" `"microk8sWindows`" `"$OPS_FOLDER`" `"$TAG`" `"$RUN_IN_DEVELOPMENT`"";

checkExitCode;

Write-Host "All Configurations Completed";

exit 0;
