$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Uri 'http://localhost:3001/login' -Method Post -Body @{username='bhondu'; password='21feb'} -WebSession $sess -UseBasicParsing | Out-Null
Write-Output 'Logged in as bhondu'

$rollJson = '{"dice":5,"path":[2,3,4,5,6],"finalPos":6,"seq":10,"to":"vishu"}'
$roll = Invoke-RestMethod -Uri 'http://localhost:3001/api/games/snake/roll' -Method Post -Body $rollJson -ContentType 'application/json' -WebSession $sess -UseBasicParsing
Write-Output "roll -> $($roll.success)"

$syncJson = '{"to":"vishu","myPos":6,"oppPos":3,"turn":false}'
$sync = Invoke-RestMethod -Uri 'http://localhost:3001/api/games/snake/sync' -Method Post -Body $syncJson -ContentType 'application/json' -WebSession $sess -UseBasicParsing
Write-Output "sync -> $($sync.success)"

$resetJson = '{"to":"vishu"}'
$reset = Invoke-RestMethod -Uri 'http://localhost:3001/api/games/snake/reset' -Method Post -Body $resetJson -ContentType 'application/json' -WebSession $sess -UseBasicParsing
Write-Output "reset -> $($reset.success)"
