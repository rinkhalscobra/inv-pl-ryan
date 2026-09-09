param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.Rate = -1
$voice.Volume = 100
$voice.SetOutputToWaveFile($OutputPath)
$text = [System.IO.File]::ReadAllText($InputPath)
$voice.Speak($text)
$voice.Dispose()
