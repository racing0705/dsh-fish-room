param([int]$Seconds = 5)
$before = @{}
Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object { $before[$_.Id] = $_.TotalProcessorTime.TotalSeconds }
Start-Sleep -Seconds $Seconds
$total = 0.0
$count = 0
foreach ($p in (Get-Process chrome -ErrorAction SilentlyContinue)) {
  $count++
  if ($before.ContainsKey($p.Id)) { $total += ($p.TotalProcessorTime.TotalSeconds - $before[$p.Id]) }
}
$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$pctOne = [math]::Round($total / $Seconds * 100, 1)
[pscustomobject]@{
  chromeProcesses = $count
  cpuOfOneCorePercent = $pctOne
  cpuOfAllCoresPercent = [math]::Round($pctOne / $cores, 2)
  cores = $cores
} | ConvertTo-Json -Compress
