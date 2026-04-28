$sessA = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$resp1 = Invoke-RestMethod -Uri 'http://localhost:3001/login' -Method Post -Body @{username='bhondu'; password='21feb'} -WebSession $sessA -UseBasicParsing
Write-Output 'Login A OK'
$sessB = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$resp2 = Invoke-RestMethod -Uri 'http://localhost:3001/login' -Method Post -Body @{username='vishu'; password='21feb'} -WebSession $sessB -UseBasicParsing
Write-Output 'Login B OK'
$pageA = Invoke-WebRequest -Uri 'http://localhost:3001/games/snake' -WebSession $sessA -UseBasicParsing
Write-Output 'Page A status:'
Write-Output $pageA.StatusCode
$pageB = Invoke-WebRequest -Uri 'http://localhost:3001/games/snake' -WebSession $sessB -UseBasicParsing
Write-Output 'Page B status:'
Write-Output $pageB.StatusCode
$json = '{"dice":4,"path":[2,3,4,5],"finalPos":5,"seq":1,"to":"vishu"}'
$roll = Invoke-RestMethod -Uri 'http://localhost:3001/api/games/snake/roll' -Method Post -Body $json -ContentType 'application/json' -WebSession $sessA -UseBasicParsing
Write-Output 'Roll response:'
Write-Output $roll
