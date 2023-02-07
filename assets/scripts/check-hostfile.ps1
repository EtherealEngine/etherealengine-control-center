
#===========
# Parameters
#===========

$EXITCODE = 0;
$IS_READONLY = $false;

if ($args[0] -eq 'readonly') {
    $IS_READONLY = $true;
}

Write-Host "$IS_READONLY";

#=======================
# Update system hostfile
#=======================

$hostFilePath = "$env:windir\System32\drivers\etc\hosts";
$wslIp = wsl hostname -I;
if ($wslIp -like "* *") {
    $wslIp = $wslIp.split(" ")[0]
}

if (Test-Path $hostFilePath) {
    $hostFileContent = Get-Content $hostFilePath -Raw;

    if ($hostFileContent -like "*local.etherealengine.com*") {
        if ($hostFileContent -like "*$wslIp local.etherealengine.com*") {
            Write-Host "*.etherealengine.com host entry exists";
        }
        else {
            Write-Host "*.etherealengine.com host entry outdated";

            if ($IS_READONLY -eq $true) {
                $EXITCODE = 1
            }
            else {
                $updatedContent = Get-Content $hostFilePath;
                $linenumber = $updatedContent | select-string "local.etherealengine.com";
                $updatedContent[$linenumber.LineNumber - 1] = "$wslIp local.etherealengine.com api-local.etherealengine.com instanceserver-local.etherealengine.com 00000.instanceserver-local.etherealengine.com 00001.instanceserver-local.etherealengine.com 00002.instanceserver-local.etherealengine.com 00003.instanceserver-local.etherealengine.com";
                Set-Content $hostFilePath $updatedContent;
            }
        }
    }
    else {
        Write-Host "*.etherealengine.com host entry needs to be added";

        if ($IS_READONLY -eq $true) {
            $EXITCODE = 1
        }
        else {
            Add-Content -Path $hostFilePath -value "$wslIp local.etherealengine.com api-local.etherealengine.com instanceserver-local.etherealengine.com 00000.instanceserver-local.etherealengine.com 00001.instanceserver-local.etherealengine.com 00002.instanceserver-local.etherealengine.com 00003.instanceserver-local.etherealengine.com";
        }
    }
    
    if ($hostFileContent -like "*microk8s.registry*") {
        if ($hostFileContent -like "*$wslIp microk8s.registry*") {
            Write-Host "microk8s.registry host entry exists";
        }
        else {
            Write-Host "microk8s.registry host entry outdated";
            
            if ($IS_READONLY -eq $true) {
                $EXITCODE = 1
            }
            else {
                $updatedContent = Get-Content $hostFilePath;
                $linenumber = $updatedContent | select-string "microk8s.registry";
                $updatedContent[$linenumber.LineNumber - 1] = "$wslIp microk8s.registry";
                Set-Content $hostFilePath $updatedContent;
            }
        }
    }
    else {
        Write-Host "microk8s.registry host entry needs to be added";

        if ($IS_READONLY -eq $true) {
            $EXITCODE = 1
        }
        else {
            Add-Content -Path $hostFilePath -value "$wslIp microk8s.registry";
        }
    }
}
else {
    Write-Host "*.etherealengine.com & microk8s.registry host entries needs to be created";
    
    if ($IS_READONLY -eq $true) {
        $EXITCODE = 1
    }
    else {
        Set-Content $hostFilePath "$wslIp local.etherealengine.com api-local.etherealengine.com instanceserver-local.etherealengine.com 00000.instanceserver-local.etherealengine.com 00001.instanceserver-local.etherealengine.com 00002.instanceserver-local.etherealengine.com 00003.instanceserver-local.etherealengine.com`n$wslIp microk8s.registry";
    }
}

exit $EXITCODE;
